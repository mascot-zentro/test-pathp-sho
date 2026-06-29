import { createClient } from "@supabase/supabase-js";
import { defineEventHandler, setResponseStatus } from "h3";

function getAdmin() {
  const url = process.env.SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) throw new Error(`Missing env: SUPABASE_URL=${!!url} SUPABASE_SERVICE_ROLE_KEY=${!!key}`);
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function getAIInsight(data: {
  date: string;
  orderCount: number;
  revenue: number;
  avgOrder: number;
  delivered: number;
  pending: number;
  cancelled: number;
  topProducts: string;
  week7dayOrders: number;
  week7dayRevenue: number;
}): Promise<string> {
  const GROQ_API_KEY = process.env.GROQ_API_KEY ?? "";
  if (!GROQ_API_KEY) return "";

  const prompt = `You are a business analyst for "The Aavira", a women's fashion store in Nepal that uses cash on delivery.

Yesterday's data (${data.date}):
- Orders: ${data.orderCount}
- Revenue: NRS ${data.revenue.toLocaleString()}
- Avg order value: NRS ${data.avgOrder.toLocaleString()}
- Delivered: ${data.delivered}, Pending/Transit: ${data.pending}, Cancelled/Returned: ${data.cancelled}
- Top products: ${data.topProducts || "none"}

Last 7 days average: ${Math.round(data.week7dayOrders / 7)} orders/day, NRS ${Math.round(data.week7dayRevenue / 7).toLocaleString()} revenue/day

Write a 2-3 sentence business insight in plain English. Be direct and actionable. Mention trends, flag concerns, suggest one action if relevant. No bullet points, no headers, no emojis. Keep it under 60 words.`;

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 120,
        temperature: 0.5,
      }),
    });
    if (!res.ok) return "";
    const json = await res.json() as { choices?: { message?: { content?: string } }[] };
    return json.choices?.[0]?.message?.content?.trim() ?? "";
  } catch {
    return "";
  }
}

export default defineEventHandler(async (event) => {
  try {
    const WEBHOOK_URL = process.env.DISCORD_DAILY_WEBHOOK_URL ?? "";
    if (!WEBHOOK_URL) return "No webhook configured";

    const db = getAdmin();

    const now = new Date();
    const todayNPT = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kathmandu" }));
    const yesterday = new Date(todayNPT);
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    const yesterdayEnd = new Date(yesterday);
    yesterdayEnd.setHours(23, 59, 59, 999);

    const offset = 5.75 * 60 * 60 * 1000;
    const from = new Date(yesterday.getTime() - offset).toISOString();
    const to = new Date(yesterdayEnd.getTime() - offset).toISOString();
    const week7ago = new Date(todayNPT.getTime() - 7 * 24 * 60 * 60 * 1000 - offset).toISOString();

    const [{ data: orders, error }, { data: week7 }] = await Promise.all([
      db.from("orders").select("id,total,status,product_name").gte("created_at", from).lte("created_at", to),
      db.from("orders").select("total").gte("created_at", week7ago).lte("created_at", to),
    ]);

    if (error) throw new Error(`Supabase error: ${error.message}`);

    const all = (orders ?? []) as { total: unknown; status: string; product_name: string }[];
    const week = (week7 ?? []) as { total: unknown }[];

    const total = all.reduce((s, o) => s + Number(o.total), 0);
    const delivered = all.filter((o) => o.status === "delivered").length;
    const cancelled = all.filter((o) => ["cancelled", "returned"].includes(o.status)).length;
    const pending = all.filter((o) => !["delivered", "cancelled", "returned"].includes(o.status)).length;
    const week7Revenue = week.reduce((s, o) => s + Number(o.total), 0);

    const productCounts: Record<string, number> = {};
    for (const o of all) productCounts[o.product_name] = (productCounts[o.product_name] ?? 0) + 1;
    const topProducts = Object.entries(productCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, count]) => `${name} (×${count})`)
      .join(", ");

    const dateLabel = yesterday.toLocaleDateString("en-NP", { weekday: "long", month: "short", day: "numeric" });

    // Get AI insight in parallel with embed building
    const aiInsight = all.length > 0 ? await getAIInsight({
      date: dateLabel,
      orderCount: all.length,
      revenue: Math.round(total),
      avgOrder: Math.round(total / all.length),
      delivered,
      pending,
      cancelled,
      topProducts,
      week7dayOrders: week.length,
      week7dayRevenue: week7Revenue,
    }) : "";

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
        ...(aiInsight ? [{ name: "🤖 AI Insight", value: aiInsight, inline: false }] : []),
      ],
      timestamp: new Date().toISOString(),
      footer: { text: "The Aavira · Daily at 9 PM NPT" },
    };

    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed] }),
    });

    if (!res.ok) throw new Error(`Discord webhook failed: ${res.status} ${await res.text()}`);

    return "OK";
  } catch (err) {
    console.error("[cron-daily-summary]", err);
    setResponseStatus(event, 500);
    return String(err instanceof Error ? err.message : err);
  }
});
