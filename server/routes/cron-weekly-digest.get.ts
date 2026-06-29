import { createClient } from "@supabase/supabase-js";

function getAdmin() {
  const url = process.env.SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) throw new Error(`Missing env: SUPABASE_URL=${!!url} SUPABASE_SERVICE_ROLE_KEY=${!!key}`);
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export default defineEventHandler(async (event) => {
  try {
    const WEBHOOK_URL = process.env.DISCORD_WEEKLY_WEBHOOK_URL ?? "";
    if (!WEBHOOK_URL) return "No webhook configured";

    const db = getAdmin();
    const nowUtc = Date.now();
    const weekAgoUtc = nowUtc - 7 * 24 * 60 * 60 * 1000;
    const prevWeekStartUtc = weekAgoUtc - 7 * 24 * 60 * 60 * 1000;

    const [{ data: thisWeek, error: e1 }, { data: prevWeek, error: e2 }] = await Promise.all([
      db.from("orders").select("total,status,product_name,created_at").gte("created_at", new Date(weekAgoUtc).toISOString()),
      db.from("orders").select("total,status").gte("created_at", new Date(prevWeekStartUtc).toISOString()).lt("created_at", new Date(weekAgoUtc).toISOString()),
    ]);

    if (e1) throw new Error(`Supabase error (thisWeek): ${e1.message}`);
    if (e2) throw new Error(`Supabase error (prevWeek): ${e2.message}`);

    const cur = (thisWeek ?? []) as { total: unknown; status: string; product_name: string; created_at: string }[];
    const prev = (prevWeek ?? []) as { total: unknown; status: string }[];

    const curRevenue = cur.reduce((s, o) => s + Number(o.total), 0);
    const prevRevenue = prev.reduce((s, o) => s + Number(o.total), 0);
    const revenueChange = prevRevenue > 0 ? ((curRevenue - prevRevenue) / prevRevenue) * 100 : null;
    const orderChange = prev.length > 0 ? ((cur.length - prev.length) / prev.length) * 100 : null;

    const delivered = cur.filter((o) => o.status === "delivered").length;
    const cancelled = cur.filter((o) => ["cancelled", "returned"].includes(o.status)).length;

    const productCounts: Record<string, number> = {};
    for (const o of cur) productCounts[o.product_name] = (productCounts[o.product_name] ?? 0) + 1;

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
      description: cur.length === 0 ? "No orders this week." : `**${startDate} – ${endDate}** recap:`,
      fields: cur.length === 0 ? [] : [
        { name: "Orders", value: `${cur.length}${fmt(orderChange)}${arrow(orderChange)}`, inline: true },
        { name: "Revenue (COD)", value: `NRS ${Math.round(curRevenue).toLocaleString()}${fmt(revenueChange)}${arrow(revenueChange)}`, inline: true },
        { name: "Avg Order Value", value: `NRS ${Math.round(curRevenue / cur.length).toLocaleString()}`, inline: true },
        { name: "Delivered", value: String(delivered), inline: true },
        { name: "Cancelled/Returned", value: String(cancelled), inline: true },
        { name: "Delivery Rate", value: `${Math.round((delivered / cur.length) * 100)}%`, inline: true },
        ...(topProducts ? [{ name: "Top Products", value: topProducts, inline: false }] : []),
        ...(bestDay ? [{ name: "Best Day", value: `${bestDay[0]} — NRS ${Math.round(bestDay[1]).toLocaleString()}`, inline: false }] : []),
      ],
      timestamp: new Date().toISOString(),
      footer: { text: "The Aavira · Every Saturday 10 PM NPT" },
    };

    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed] }),
    });

    if (!res.ok) throw new Error(`Discord webhook failed: ${res.status} ${await res.text()}`);

    return "OK";
  } catch (err) {
    console.error("[cron-weekly-digest]", err);
    setResponseStatus(event, 500);
    return String(err instanceof Error ? err.message : err);
  }
});
