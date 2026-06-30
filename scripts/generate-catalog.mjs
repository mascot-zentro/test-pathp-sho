/**
 * Generates public/catalog.csv from live Supabase products, for Meta Commerce
 * Manager to import as a product catalog feed.
 * Usage: node scripts/generate-catalog.mjs
 *
 * Requires env vars: VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, SITE_URL
 * Or edit the constants at the top of this file.
 */

import { writeFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dir = dirname(fileURLToPath(import.meta.url));

// ── Configure ──────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? "https://YOUR_PROJECT.supabase.co";
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "YOUR_ANON_KEY";
const SITE_URL     = (process.env.SITE_URL ?? "https://YOUR_DOMAIN").replace(/\/$/, "");
// ──────────────────────────────────────────────────────────────────────────

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function csvField(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

async function main() {
  const { data: products, error } = await supabase
    .from("products")
    .select("id,name,description,price,sale_price,on_sale,image_url,stock_quantity,category")
    .eq("active", true);

  if (error) { console.error("Supabase error:", error.message); process.exit(1); }

  const header = ["id", "title", "description", "availability", "condition", "price", "link", "image_link", "brand", "product_type"];

  const rows = (products ?? [])
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
        `${SITE_URL}/product/${slugify(p.name)}`,
        p.image_url ?? "",
        "The Aavira",
        p.category ?? "",
      ].join(",");
    });

  const csv = [header.join(","), ...rows].join("\n");

  const out = resolve(__dir, "../public/catalog.csv");
  writeFileSync(out, csv, "utf8");
  console.log(`✓ catalog.csv written — ${rows.length} active products`);
}

main();
