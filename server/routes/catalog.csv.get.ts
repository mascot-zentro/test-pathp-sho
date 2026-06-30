import { createClient } from "@supabase/supabase-js";
import { defineEventHandler, setResponseStatus, setResponseHeaders } from "h3";

function getAdmin() {
  const url = process.env.SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) throw new Error(`Missing env: SUPABASE_URL=${!!url} SUPABASE_SERVICE_ROLE_KEY=${!!key}`);
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/['"]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "product";
}

function csvField(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

type Product = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  sale_price: number | null;
  on_sale: boolean;
  image_url: string | null;
  stock_quantity: number | null;
  category: string | null;
};

export default defineEventHandler(async (event) => {
  try {
    const db = getAdmin();

    const [{ data: settings }, { data: products, error }] = await Promise.all([
      db.from("app_settings").select("key,value").in("key", ["site_url"]),
      db.from("products").select("id,name,description,price,sale_price,on_sale,image_url,stock_quantity,category").eq("active", true),
    ]);

    if (error) throw new Error(`Supabase error: ${error.message}`);

    const obj: Record<string, string> = {};
    (settings ?? []).forEach((r: { key: string; value: string | null }) => { if (r.value) obj[r.key] = r.value; });
    const base = (obj.site_url ?? "https://theaavira.com").replace(/\/$/, "");

    const header = ["id", "title", "description", "availability", "condition", "price", "link", "image_link", "brand", "product_type"];

    const rows = (products as Product[] ?? [])
      .filter((p) => p.image_url)
      .map((p) => {
        const price = p.on_sale && p.sale_price ? p.sale_price : p.price;
        const availability = p.stock_quantity === 0 ? "out of stock" : "in stock";
        const description = p.description?.trim() || p.name;
        return [
          p.id,
          csvField(p.name),
          csvField(description),
          availability,
          "new",
          `${Number(price).toFixed(2)} NPR`,
          `${base}/product/${slugify(p.name)}`,
          p.image_url ?? "",
          "The Aavira",
          p.category ?? "",
        ].join(",");
      });

    const csv = [header.join(","), ...rows].join("\n");

    setResponseHeaders(event, {
      "Content-Type": "text/csv; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    });
    return csv;
  } catch (err) {
    console.error("[catalog.csv]", err);
    setResponseStatus(event, 500);
    return String(err instanceof Error ? err.message : err);
  }
});
