import { createServerFileRoute } from "@tanstack/react-start/server";

function slugify(name: string): string {
  return name.toLowerCase().replace(/['"]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "product";
}

function url(loc: string, changefreq: string, priority: string) {
  return `  <url>\n    <loc>${loc}</loc>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
}

export const ServerRoute = createServerFileRoute("/sitemap.xml").methods({
  GET: async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: settings }, { data: products }] = await Promise.all([
      supabaseAdmin.from("app_settings").select("key,value").in("key", ["site_url"]),
      supabaseAdmin.from("products").select("name").eq("active", true),
    ]);

    const obj: Record<string, string> = {};
    (settings ?? []).forEach((r: { key: string; value: string | null }) => { if (r.value) obj[r.key] = r.value; });
    const base = (obj.site_url ?? "https://www.theaavira.com").replace(/\/$/, "");

    const staticPages = [
      { path: "/",       changefreq: "daily",   priority: "1.0" },
      { path: "/sale",   changefreq: "daily",   priority: "0.9" },
      { path: "/impact", changefreq: "monthly", priority: "0.7" },
      { path: "/faq",    changefreq: "monthly", priority: "0.5" },
      { path: "/track",  changefreq: "monthly", priority: "0.4" },
      { path: "/terms",  changefreq: "yearly",  priority: "0.3" },
    ];

    const productUrls = (products ?? []).map((p: { name: string }) =>
      url(`${base}/product/${slugify(p.name)}`, "weekly", "0.8")
    );

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticPages.map((p) => url(`${base}${p.path}`, p.changefreq, p.priority)).join("\n")}
${productUrls.join("\n")}
</urlset>`;

    return new Response(xml, {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    });
  },
});
