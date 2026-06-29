import { createServerFileRoute } from "@tanstack/react-start/server";

const WEBHOOK_URL = process.env.DISCORD_WEEKLY_WEBHOOK_URL ?? "";
const CRON_SECRET = process.env.CRON_SECRET ?? "";

export const ServerRoute = createServerFileRoute("/api/cron/weekly-digest").methods({
  GET: async ({ request }) => {
    const auth = request.headers.get("authorization") ?? "";
    if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
      return new Response("Unauthorized", { status: 401 });
    }
    if (!WEBHOOK_URL) return new Response("No webhook configured", { status: 200 });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const offset = 5.75 * 60 * 60 * 1000;
    const nowUtc = Date.now();
    const weekAgoUtc = nowUtc - 7 * 24 * 60 * 60 * 1000;
    const prevWeekStartUtc = weekAgoUtc - 7 * 24 * 60 * 60 * 1000;

    const from = new Date(weekAgoUtc - offset).toISOString();
    const prevFrom = new Date(prevWeekStartUtc - offset).toISOString();
    const prevTo = new Date(weekAgoUtc - offset).toISOString();

    const [{ data: thisWeekOrders }, { data: prevWeekOrders }] = await Promise.all([
      supabaseAdmin.from("orders").select("id,total,status,product_name,source,created_at").gte("created_at", from),
      supabaseAdmin.from("orders").select("id,total,status").gte("created_at", prevFrom).lt("created_at", prevTo),
    ]);

    const cur = thisWeekOrders ?? [];
    const prev = prevWeekOrders ?? [];

    const curRevenue = cur.reduce((s, o) => s + Number(o.total), 0);
    const prevRevenue = prev.reduce((s, o) => s + Number(o.total), 0);
    const revenueChange = prevRevenue > 0 ? ((curRevenue - prevRevenue) / prevRevenue) * 100 : null;
    const orderChange = prev.length > 0 ? ((cur.length - prev.length) / prev.length) * 100 : null;

    const delivered = cur.filter((o) => o.status === "delivered").length;
    const cancelled = cur.filter((o) => ["cancelled", "returned"].includes(o.status)).length;

    const productCounts: Record<string, number> = {};
    for (const o of cur) {
      productCounts[o.product_name] = (productCounts[o.product_name] ?? 0) + 1;
    }
    const topProducts = Object.entries(productCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count], i) => `${i + 1}. ${name} — ${count} order${count > 1 ? "s" : ""}`)
      .join("\n");

    const dayTotals: Record<string, number> = {};
    for (const o of cur) {
      const day = new Date(o.created_at).toLocaleDateString("en-NP", { weekday: "long", timeZone: "Asia/Kathmandu" });
      dayTotals[day] = (dayTotals[day] ?? 0) + Number(o.total);
    }
    const bestDay = Object.entries(dayTotals).sort((a, b) => b[1] - a[1])[0];

    const fmt = (n: number | null) => n === null ? "" : ` (${n > 0 ? "+" : ""}${Math.round(n)}%)`;
    const arrow = (n: number | null) => n === null ? "" : n > 0 ? " 📈" : n < 0 ? " 📉" : "";

    const startDate = new Date(weekAgoUtc).toLocaleDateString("en-NP", { month: "short", day: "numeric", timeZone: "Asia/Kathmandu" });
    const endDate = new Date(nowUtc).toLocaleDateString("en-NP", { month: "short", day: "numeric", timeZone: "Asia/Kathmandu" });

    const embed = {
      title: "📊 Weekly Sales Digest",
      color: 0x2563eb,
      description: cur.length === 0
        ? "No orders this week."
        : `**${startDate} – ${endDate}** recap:`,
      fields: cur.length === 0 ? [] : [
        { name: "Orders", value: `${cur.length}${fmt(orderChange)}${arrow(orderChange)}`, inline: true },
        { name: "Revenue (COD)", value: `NRS ${Math.round(curRevenue).toLocaleString()}${fmt(revenueChange)}${arrow(revenueChange)}`, inline: true },
        { name: "Avg Order Value", value: `NRS ${Math.round(curRevenue / cur.length).toLocaleString()}`, inline: true },
        { name: "Delivered", value: String(delivered), inline: true },
        { name: "Cancelled/Returned", value: String(cancelled), inline: true },
        { name: "Delivery Rate", value: cur.length > 0 ? `${Math.round((delivered / cur.length) * 100)}%` : "—", inline: true },
        ...(topProducts ? [{ name: "Top Products", value: topProducts, inline: false }] : []),
        ...(bestDay ? [{ name: "Best Day", value: `${bestDay[0]} — NRS ${Math.round(bestDay[1]).toLocaleString()}`, inline: false }] : []),
      ],
      timestamp: new Date().toISOString(),
      footer: { text: "The Aavira · Every Saturday 10 PM NPT" },
    };

    await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed] }),
    });

    return new Response("OK", { status: 200 });
  },
});
