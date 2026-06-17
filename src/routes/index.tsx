import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Modern Store — Shop the collection" },
      { name: "description", content: "Curated essentials, delivered nationwide." },
    ],
  }),
  component: Index,
});

type Product = { id: string; name: string; price: number; sale_price: number | null; on_sale: boolean; image_url: string | null; stock_quantity: number | null; category: string | null };

function Index() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [hero, setHero] = useState({ title: "Considered objects for everyday life.", subtitle: "A small collection, refreshed seasonally. Cash on delivery available across the country.", image: "" });
  const [about, setAbout] = useState({ title: "", body: "", image: "" });
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  useEffect(() => {
    supabase.from("products").select("id,name,price,sale_price,on_sale,image_url,stock_quantity,category").eq("active", true).order("created_at", { ascending: false })
      .then(({ data }) => { setProducts((data as Product[]) ?? []); setLoading(false); });
  }, []);

  useEffect(() => {
    supabase.from("app_settings").select("key,value").in("key", ["hero_title", "hero_subtitle", "hero_image_url", "about_title", "about_body", "about_image_url"]).then(({ data }) => {
      const obj: Record<string, string> = {};
      (data ?? []).forEach((r) => { if (r.value) obj[r.key] = r.value; });
      setHero((h) => ({ title: obj.hero_title || h.title, subtitle: obj.hero_subtitle || h.subtitle, image: obj.hero_image_url || "" }));
      setAbout({ title: obj.about_title || "", body: obj.about_body || "", image: obj.about_image_url || "" });
    });
  }, []);

  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => { if (p.category) set.add(p.category); });
    return [...set];
  }, [products]);

  const visibleProducts = activeCategory ? products.filter((p) => p.category === activeCategory) : products;

  return (
    <div className="min-h-screen flex flex-col">
      <SiteNav />
      <main className="flex-1">
      <section className="relative container mx-auto px-6 py-20 md:py-28 text-center overflow-hidden">
        {hero.image && (
          <div className="absolute inset-0 -z-10">
            <img src={hero.image} alt="" className="w-full h-full object-cover opacity-20" />
          </div>
        )}
        <h1 className="text-5xl md:text-7xl font-display tracking-tight max-w-3xl mx-auto">{hero.title}</h1>
        <p className="mt-6 text-muted-foreground max-w-xl mx-auto">{hero.subtitle}</p>
      </section>
      <section className="container mx-auto px-6 pb-24">
        <div className="flex items-end justify-between mb-6">
          <h2 className="text-2xl font-display">Shop</h2>
          <Link to="/sale" className="text-sm text-accent hover:underline">View sale →</Link>
        </div>
        {categories.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-8">
            <button type="button" onClick={() => setActiveCategory(null)}
              className={`text-sm px-3 py-1.5 rounded-full border transition ${activeCategory === null ? "border-accent text-accent bg-accent/10" : "border-border hover:border-accent/50"}`}>
              All
            </button>
            {categories.map((c) => (
              <button key={c} type="button" onClick={() => setActiveCategory(c)}
                className={`text-sm px-3 py-1.5 rounded-full border transition ${activeCategory === c ? "border-accent text-accent bg-accent/10" : "border-border hover:border-accent/50"}`}>
                {c}
              </button>
            ))}
          </div>
        )}
        {loading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : visibleProducts.length === 0 ? (
          <p className="text-muted-foreground">{products.length === 0 ? "No products yet. Admins can add products from the admin panel." : "No products in this category yet."}</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-12">
            {visibleProducts.map((p) => (
              <Link key={p.id} to="/product/$id" params={{ id: p.id }} className="group">
                <div className="aspect-[4/5] bg-muted overflow-hidden rounded-md relative">
                  {p.image_url ? (
                    <img src={p.image_url} alt={p.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  ) : (
                    <div className="w-full h-full grid place-items-center text-muted-foreground text-xs">No image</div>
                  )}
                  {p.stock_quantity === 0 && (
                    <span className="absolute top-2 left-2 bg-background/90 text-destructive text-xs font-medium px-2 py-1 rounded">Out of stock</span>
                  )}
                </div>
                <div className="mt-4 flex items-start justify-between gap-2">
                  <h3 className="text-sm font-medium leading-tight">{p.name}</h3>
                  <div className="text-sm tabular-nums whitespace-nowrap">
                    {p.on_sale && p.sale_price ? (
                      <span><span className="text-muted-foreground line-through mr-1">৳{p.price}</span><span className="text-accent">৳{p.sale_price}</span></span>
                    ) : (
                      <span>৳{p.price}</span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
      {about.title && (
        <section className="border-t bg-muted/30">
          <div className="container mx-auto px-6 py-20 grid md:grid-cols-2 gap-10 items-center">
            {about.image && (
              <div className="aspect-[4/3] rounded-md overflow-hidden order-first md:order-none">
                <img src={about.image} alt="" className="w-full h-full object-cover" />
              </div>
            )}
            <div>
              <h2 className="text-3xl font-display">{about.title}</h2>
              {about.body && <p className="mt-4 text-muted-foreground leading-relaxed whitespace-pre-line">{about.body}</p>}
            </div>
          </div>
        </section>
      )}
      </main>
      <SiteFooter />
    </div>
  );
}
