import { createServerFileRoute } from "@tanstack/react-start/server";

const WEBHOOK_URL = process.env.DISCORD_DAILY_WEBHOOK_URL ?? "";
const CRON_SECRET = process.env.CRON_SECRET ?? "";

export const ServerRoute = createServerFileRoute("/api/cron/daily-summary").methods({
  GET: async ({ request }) => {
    const auth = request.headers.get("authorization") ?? "";
    if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
      return new Response("Unauthorized", { status: 401 });
    }
    if (!WEBHOOK_URL) return new Response("No webhook configured", { status: 200 });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const now = new Date();
    const todayNPT = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kathmandu" }));
    const yesterday = new Date(todayNPT);
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    const yesterdayEnd = new Date(yesterday);
    yesterdayEnd.setHours(23, 59, 59, 999);

    // Convert back to UTC for the DB query
    const offset = 5.75 * 60 * 60 * 1000; // NPT is UTC+5:45
    const from = new Date(yesterday.getTime() - offset).toISOString();
    const to = new Date(yesterdayEnd.getTime() - offset).toISOString();

    const { data: orders } = await supabaseAdmin
      .from("orders")
      .select("id,total,status,product_name,source")
      .gte("created_at", from)
      .lte("created_at", to);

    const all = orders ?? [];
    const total = all.reduce((s, o) => s + Number(o.total), 0);
    const delivered = all.filter((o) => o.status === "delivered").length;
    const cancelled = all.filter((o) => ["cancelled", "returned"].includes(o.status)).length;
    const pending = all.filter((o) => !["delivered", "cancelled", "returned"].includes(o.status)).length;

    // Top products
    const productCounts: Record<string, number> = {};
    for (const o of all) {
      productCounts[o.product_name] = (productCounts[o.product_name] ?? 0) + 1;
    }
    const topProducts = Object.entries(productCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, count]) => `${name} (×${count})`)
      .join(", ");

    const dateLabel = yesterday.toLocaleDateString("en-NP", { weekday: "long", month: "short", day: "numeric" });

    const embed = {
      title: "💰 Daily Revenue Summary",
      color: all.length === 0 ? 0x6b7280 : 0x16a34a,
      description: all.length === 0
        ? `No orders yesterday (${dateLabel}).`
        : `Here's how **${dateLabel}** went:`,
      fields: all.length === 0 ? [] : [
        { name: "Total Orders", value: String(all.length), inline: true },
        { name: "Revenue (COD)", value: `NRS ${Math.round(total).toLocaleString()}`, inline: true },
        { name: "Avg Order", value: `NRS ${Math.round(total / all.length).toLocaleString()}`, inline: true },
        { name: "Delivered", value: String(delivered), inline: true },
        { name: "Pending/Transit", value: String(pending), inline: true },
        { name: "Cancelled/Returned", value: String(cancelled), inline: true },
        ...(topProducts ? [{ name: "Top Products", value: topProducts, inline: false }] : []),
      ],
      timestamp: new Date().toISOString(),
      footer: { text: "The Aavira · Daily at 9 PM NPT" },
    };

    await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed] }),
    });

    return new Response("OK", { status: 200 });
  },
});
