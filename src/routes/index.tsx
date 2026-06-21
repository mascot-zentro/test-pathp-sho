import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { Reveal } from "@/components/reveal";
import { Truck, ShieldCheck, RotateCcw } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Modern Store — Shop the collection" },
      { name: "description", content: "Curated essentials, delivered nationwide. Cash on delivery available." },
    ],
  }),
  component: Index,
});

type Product = {
  id: string;
  name: string;
  price: number;
  sale_price: number | null;
  on_sale: boolean;
  image_url: string | null;
  stock_quantity: number | null;
  category: string | null;
};

function Index() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [hero, setHero] = useState({
    title: "Considered objects for everyday life.",
    subtitle: "A small collection, refreshed seasonally. Cash on delivery available across the country.",
    image: "",
  });
  const [about, setAbout] = useState({ title: "", body: "", image: "" });
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("products")
      .select("id,name,price,sale_price,on_sale,image_url,stock_quantity,category")
      .eq("active", true)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setProducts((data as Product[]) ?? []);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    supabase
      .from("app_settings")
      .select("key,value")
      .in("key", ["hero_title", "hero_subtitle", "hero_image_url", "about_title", "about_body", "about_image_url"])
      .then(({ data }) => {
        const obj: Record<string, string> = {};
        (data ?? []).forEach((r) => { if (r.value) obj[r.key] = r.value; });
        setHero((h) => ({
          title: obj.hero_title || h.title,
          subtitle: obj.hero_subtitle || h.subtitle,
          image: obj.hero_image_url || "",
        }));
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
    <div className="min-h-screen flex flex-col bg-background">
      <SiteNav />
      <main className="flex-1">

        {/* Hero */}
        <section className="relative overflow-hidden">
          {hero.image && (
            <div className="absolute inset-0 -z-10">
              <img src={hero.image} alt="" className="w-full h-full object-cover opacity-[0.12]" />
            </div>
          )}
          <div className="container mx-auto px-6 py-24 md:py-32 text-center">
            <Reveal>
              <h1 className="text-4xl md:text-6xl font-display tracking-tight max-w-3xl mx-auto leading-[1.1]">
                {hero.title}
              </h1>
            </Reveal>
            <Reveal delay={100}>
              <p className="mt-5 text-muted-foreground max-w-md mx-auto text-base md:text-lg">
                {hero.subtitle}
              </p>
            </Reveal>
            <Reveal delay={200}>
              <a
                href="#shop"
                className="mt-9 inline-flex items-center px-7 py-3 rounded-full bg-foreground text-background text-sm font-medium transition-all duration-300 hover:opacity-85 hover:scale-[1.03] hover:shadow-lg"
              >
                Shop the collection
              </a>
            </Reveal>
          </div>
        </section>

        {/* Trust strip */}
        <Reveal as="div" className="border-t border-b" direction="none">
          <div className="container mx-auto px-6 py-5 flex flex-wrap items-center justify-center gap-x-10 gap-y-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-2">
              <Truck className="size-3.5" /> Nationwide delivery
            </span>
            <span className="flex items-center gap-2">
              <ShieldCheck className="size-3.5" /> Cash on delivery
            </span>
            <span className="flex items-center gap-2">
              <RotateCcw className="size-3.5" /> Easy returns
            </span>
          </div>
        </Reveal>

        {/* Product grid */}
        <section id="shop" className="container mx-auto px-6 py-16 md:py-20">
          <div className="flex items-end justify-between mb-8">
            <h2 className="text-xl md:text-2xl font-display">Shop</h2>
            <Link to="/sale" className="text-sm text-muted-foreground hover:text-accent transition-colors">
              Sale →
            </Link>
          </div>

          {categories.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-10">
              <button
                type="button"
                onClick={() => setActiveCategory(null)}
                className={`text-sm px-3 py-1.5 rounded-full border transition-all duration-200 ${
                  activeCategory === null
                    ? "border-foreground text-foreground"
                    : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground hover:scale-[1.04]"
                }`}
              >
                All
              </button>
              {categories.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setActiveCategory(c)}
                  className={`text-sm px-3 py-1.5 rounded-full border transition-all duration-200 ${
                    activeCategory === c
                      ? "border-foreground text-foreground"
                      : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground hover:scale-[1.04]"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          )}

          {loading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-12">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="animate-pulse">
                  <div className="aspect-[4/5] rounded-md bg-muted" />
                  <div className="mt-4 h-3.5 bg-muted rounded w-3/4" />
                  <div className="mt-2 h-3.5 bg-muted rounded w-1/4" />
                </div>
              ))}
            </div>
          ) : visibleProducts.length === 0 ? (
            <p className="text-muted-foreground text-sm py-16 text-center">
              {products.length === 0 ? "No products yet — check back soon." : "No products in this category yet."}
            </p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-12">
              {visibleProducts.map((p, i) => {
                const outOfStock = p.stock_quantity === 0;
                return (
                  <Reveal key={p.id} delay={(i % 8) * 60}>
                    <Link to="/product/$id" params={{ id: p.id }} className="group">
                      <div className="aspect-[4/5] bg-muted overflow-hidden rounded-md relative">
                        {p.image_url ? (
                          <img
                            src={p.image_url}
                            alt={p.name}
                            className={`w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03] ${outOfStock ? "opacity-50" : ""}`}
                          />
                        ) : (
                          <div className="w-full h-full grid place-items-center text-muted-foreground text-xs">No image</div>
                        )}
                        {outOfStock && (
                          <span className="absolute top-2 left-2 bg-background/90 text-muted-foreground text-xs font-medium px-2 py-1 rounded">
                            Out of stock
                          </span>
                        )}
                        {p.on_sale && p.sale_price && !outOfStock && (
                          <span className="absolute top-2 left-2 bg-foreground text-background text-xs font-medium px-2 py-1 rounded">
                            Sale
                          </span>
                        )}
                      </div>
                      <div className="mt-4 flex items-start justify-between gap-2">
                        <h3 className="text-sm leading-tight transition-colors group-hover:text-accent">{p.name}</h3>
                        <div className="text-sm tabular-nums whitespace-nowrap">
                          {p.on_sale && p.sale_price ? (
                            <span>
                              <span className="text-muted-foreground line-through mr-1.5 text-xs">NRS {p.price}</span>
                              <span className="text-accent">NRS {p.sale_price}</span>
                            </span>
                          ) : (
                            <span>NRS {p.price}</span>
                          )}
                        </div>
                      </div>
                    </Link>
                  </Reveal>
                );
              })}
            </div>
          )}
        </section>

        {/* About */}
        {about.title && (
          <section className="border-t bg-muted/30">
            <div className="container mx-auto px-6 py-20 grid md:grid-cols-2 gap-10 items-center">
              {about.image && (
                <Reveal direction="none" className="aspect-[4/3] rounded-md overflow-hidden order-first md:order-none">
                  <img src={about.image} alt="" className="w-full h-full object-cover" />
                </Reveal>
              )}
              <Reveal delay={100}>
                <h2 className="text-3xl font-display">{about.title}</h2>
                {about.body && (
                  <p className="mt-4 text-muted-foreground leading-relaxed whitespace-pre-line">{about.body}</p>
                )}
              </Reveal>
            </div>
          </section>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
