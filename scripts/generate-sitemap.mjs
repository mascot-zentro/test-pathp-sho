/**
 * Generates public/sitemap.xml from live Supabase product slugs.
 * Usage: node scripts/generate-sitemap.mjs
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

const STATIC_PAGES = [
  { path: "/",      changefreq: "daily",   priority: "1.0" },
  { path: "/sale",  changefreq: "daily",   priority: "0.9" },
  { path: "/faq",   changefreq: "monthly", priority: "0.5" },
  { path: "/track", changefreq: "monthly", priority: "0.4" },
  { path: "/terms", changefreq: "yearly",  priority: "0.3" },
];

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function urlBlock({ loc, changefreq, priority }) {
  return `  <url>\n    <loc>${loc}</loc>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
}

async function main() {
  const { data: products, error } = await supabase
    .from("products")
    .select("name,updated_at")
    .eq("active", true)
    .order("name");

  if (error) { console.error("Supabase error:", error.message); process.exit(1); }

  const staticBlocks = STATIC_PAGES.map((p) =>
    urlBlock({ loc: `${SITE_URL}${p.path}`, changefreq: p.changefreq, priority: p.priority })
  );

  const productBlocks = (products ?? []).map((p) =>
    urlBlock({
      loc: `${SITE_URL}/product/${slugify(p.name)}`,
      changefreq: "weekly",
      priority: "0.8",
    })
  );

  const xml = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    "",
    "  <!-- Static pages -->",
    ...staticBlocks,
    "",
    `  <!-- Product pages (${productBlocks.length} active products) -->`,
    ...productBlocks,
    "",
    `</urlset>`,
  ].join("\n");

  const out = resolve(__dir, "../public/sitemap.xml");
  writeFileSync(out, xml, "utf8");
  console.log(`✓ sitemap.xml written — ${STATIC_PAGES.length} static + ${productBlocks.length} product URLs`);
}

main();
