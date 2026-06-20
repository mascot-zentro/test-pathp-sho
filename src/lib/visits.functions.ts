import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Logs one page view with a coarse location, derived from the request's
// Vercel geo headers (x-vercel-ip-city / -country-region / -country).
// Those headers are only present on Vercel's edge network in production —
// locally or on other hosts they're simply absent, so we fall back to
// "Unknown" rather than calling any external geolocation API. No client
// JS beyond a single fetch is involved, and no cookies are set.
export const logPageVisit = createServerFn({ method: "POST" })
  .inputValidator(z.object({ path: z.string().max(300) }))
  .handler(async ({ data }) => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const headers = getRequest().headers;
    const city = headers.get("x-vercel-ip-city");
    const region = headers.get("x-vercel-ip-country-region");
    const country = headers.get("x-vercel-ip-country");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("page_visits").insert({
      path: data.path,
      city: city ? decodeURIComponent(city) : null,
      region: region || null,
      country: country || null,
    });
    return { ok: true };
  });

// Admin-only summary used for the dashboard pie chart: how many visits
// came from each location over the selected window. Grouping happens in
// JS rather than a DB view to keep this simple — fine at this scale.
export const getVisitsByLocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ days: z.number().int().min(1).max(365) }))
  .handler(async ({ data, context }) => {
    const { data: roles } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId).eq("role", "admin");
    if (!roles || roles.length === 0) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - data.days + 1);
    cutoff.setHours(0, 0, 0, 0);

    const { data: visits, error } = await supabaseAdmin
      .from("page_visits")
      .select("city,region,country,created_at")
      .gte("created_at", cutoff.toISOString());
    if (error) throw new Error(error.message);

    const byLocation = new Map<string, number>();
    for (const v of visits ?? []) {
      const label = v.city || v.region || v.country || "Unknown";
      byLocation.set(label, (byLocation.get(label) ?? 0) + 1);
    }

    return {
      total: visits?.length ?? 0,
      locations: [...byLocation.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count),
    };
  });
