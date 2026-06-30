import { createServerFileRoute } from "@tanstack/react-start/server";

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

export const ServerRoute = createServerFileRoute("/catalog.csv").methods({
  GET: async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: settings }, { data: products }] = await Promise.all([
      supabaseAdmin.from("app_settings").select("key,value").in("key", ["site_url"]),
      supabaseAdmin
        .from("products")
        .select("id,name,description,price,sale_price,on_sale,image_url,stock_quantity,category")
        .eq("active", true),
    ]);

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
          `${price.toFixed(2)} NPR`,
          `${base}/product/${slugify(p.name)}`,
          p.image_url ?? "",
          "The Aavira",
          p.category ?? "",
        ].join(",");
      });

    const csv = [header.join(","), ...rows].join("\n");

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    });
  },
});
