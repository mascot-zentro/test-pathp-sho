import { createFileRoute, Link } from "@tanstack/react-router";
import { slugify } from "@/lib/slugify";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { Reveal } from "@/components/reveal";
import { Truck, ShieldCheck, RotateCcw, Sparkles, ArrowRight } from "lucide-react";

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

const MARQUEE_ITEMS = [
  "New arrivals", "Free returns", "Cash on delivery",
  "Nationwide shipping", "Curated styles", "Fresh drops",
  "New arrivals", "Free returns", "Cash on delivery",
  "Nationwide shipping", "Curated styles", "Fresh drops",
];

function Index() {
  const [products, setProducts] = useState<Product[]>([]);
  const [hoverImages, setHoverImages] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [hero, setHero] = useState({
    title: "Dress the story\nyou want to tell.",
    subtitle: "A curated edit for the woman who knows herself. Cash on delivery, nationwide.",
    image: "",
  });
  const [about, setAbout] = useState({ title: "", body: "", image: "" });
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const heroImgRef = useRef<HTMLImageElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = heroImgRef.current;
    if (!hero.image || !node) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let ctx: { revert: () => void } | undefined;
    Promise.all([import("gsap"), import("gsap/ScrollTrigger")]).then(([{ gsap }, { ScrollTrigger }]) => {
      gsap.registerPlugin(ScrollTrigger);
      ctx = gsap.context(() => {
        gsap.to(node, {
          yPercent: 30,
          ease: "none",
          scrollTrigger: {
            trigger: node.closest("section"),
            start: "top top",
            end: "bottom top",
            scrub: true,
          },
        });
      });
    });
    return () => ctx?.revert();
  }, [hero.image]);

  useEffect(() => {
    supabase
      .from("products")
      .select("id,name,price,sale_price,on_sale,image_url,stock_quantity,category")
      .eq("active", true)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        const list = (data as Product[]) ?? [];
        setProducts(list);
        setLoading(false);
        // Fetch the second gallery image for every product in one query.
        // position=1 is the second image (position=0 is the primary).
        if (list.length > 0) {
          supabase
            .from("product_images")
            .select("product_id,image_url")
            .in("product_id", list.map((p) => p.id))
            .eq("position", 1)
            .then(({ data: imgs }) => {
              const map: Record<string, string> = {};
              (imgs ?? []).forEach((r: { product_id: string; image_url: string }) => { map[r.product_id] = r.image_url; });
              setHoverImages(map);
            });
        }
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

  // Stagger product cards in with GSAP when they load or category changes
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid || visibleProducts.length === 0) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const cards = grid.querySelectorAll<HTMLElement>(":scope > *");
    import("gsap").then(({ gsap }) => {
      gsap.fromTo(cards,
        { opacity: 0, y: 24 },
        { opacity: 1, y: 0, duration: 0.55, ease: "power2.out", stagger: 0.07, clearProps: "opacity,transform" },
      );
    });
  }, [visibleProducts]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => { if (p.category) set.add(p.category); });
    return [...set];
  }, [products]);

  const visibleProducts = activeCategory ? products.filter((p) => p.category === activeCategory) : products;

  return (
    <div className="min-h-screen flex flex-col bg-background page-enter">
      <SiteNav />
      <main className="flex-1">

        {/* ── Cinematic Hero ─────────────────────────────────────────────── */}
        <section className="relative overflow-hidden grain min-h-[88vh] flex items-center">
          {/* Background image with dramatic overlay */}
          {hero.image ? (
            <>
              <div className="absolute inset-0 -z-10 overflow-hidden">
                <img ref={heroImgRef} src={hero.image} alt="" fetchPriority="high" decoding="async" className="w-full h-[115%] object-cover will-change-transform" style={{ top: 0 }} />
              </div>
              <div className="absolute inset-0 -z-10 bg-gradient-to-b from-background/20 via-background/50 to-background/90" />
            </>
          ) : (
            /* Decorative gradient when no hero image is set */
            <div className="absolute inset-0 -z-10">
              <div className="absolute inset-0 bg-gradient-to-br from-[oklch(0.94_0.03_358)] via-background to-[oklch(0.96_0.018_72)]" />
              {/* Soft orbs */}
              <div className="absolute -top-20 -left-20 w-[500px] h-[500px] rounded-full bg-[oklch(0.88_0.06_358/0.35)] blur-[120px]" />
              <div className="absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full bg-[oklch(0.90_0.04_45/0.25)] blur-[100px]" />
            </div>
          )}

          <div className="container mx-auto px-6 py-16 md:py-40 grid md:grid-cols-2 gap-8 md:gap-12 items-center">
            <div>
              <Reveal>
                <span className="inline-flex items-center gap-2 text-xs font-medium tracking-[0.18em] uppercase text-accent mb-6">
                  <Sparkles className="size-3.5 animate-soft-pulse" /> New season
                </span>
              </Reveal>
              <Reveal delay={80}>
                <h1 className="text-4xl sm:text-5xl md:text-7xl font-display font-light leading-[1.05] tracking-tight whitespace-pre-line">
                  {hero.title}
                </h1>
              </Reveal>
              <Reveal delay={180}>
                <p className="mt-6 text-base md:text-lg text-muted-foreground max-w-sm leading-relaxed font-light">
                  {hero.subtitle}
                </p>
              </Reveal>
              <Reveal delay={280}>
                <div className="mt-10 flex flex-wrap gap-3">
                  <a
                    href="#shop"
                    className="group inline-flex items-center gap-2 px-8 py-3.5 rounded-full bg-foreground text-background text-sm font-medium tracking-wide transition-all duration-300 hover:bg-accent hover:shadow-[0_8px_30px_oklch(0.62_0.14_358/0.4)] hover:scale-[1.03]"
                  >
                    Shop collection
                    <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                  </a>
                  <Link
                    to="/sale"
                    className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full border border-foreground/20 text-sm font-medium tracking-wide transition-all duration-300 hover:border-accent hover:text-accent hover:scale-[1.02]"
                  >
                    View sale
                  </Link>
                </div>
              </Reveal>
            </div>

            {/* Featured product card teaser — first product image */}
            {!loading && products[0]?.image_url && (
              <Reveal delay={120} direction="none">
                <Link to="/product/$slug" params={{ slug: slugify(products[0].name) }} className="group block relative">
                  <div className="aspect-[3/4] rounded-2xl overflow-hidden shadow-2xl ring-1 ring-foreground/5">
                    <img
                      src={products[0].image_url}
                      alt={products[0].name}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-foreground/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                    <div className="absolute bottom-0 left-0 right-0 p-6 translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-400">
                      <p className="text-background font-display text-xl">{products[0].name}</p>
                      <p className="text-background/80 text-sm mt-1">
                        NRS {products[0].on_sale && products[0].sale_price ? products[0].sale_price : products[0].price}
                      </p>
                    </div>
                  </div>
                  {/* Floating badge */}
                  <div className="absolute -top-3 -right-3 bg-accent text-accent-foreground text-xs font-medium px-3 py-1.5 rounded-full shadow-lg animate-float">
                    Just in ✦
                  </div>
                </Link>
              </Reveal>
            )}
          </div>
        </section>

        {/* ── Marquee strip ──────────────────────────────────────────────── */}
        <div className="overflow-hidden border-y border-border/60 bg-[oklch(0.96_0.018_60)] py-3.5">
          <div className="flex whitespace-nowrap animate-marquee">
            {MARQUEE_ITEMS.map((item, i) => (
              <span key={i} className="inline-flex items-center gap-3 px-6 text-xs font-medium tracking-[0.15em] uppercase text-muted-foreground">
                {item}
                <span className="text-accent">✦</span>
              </span>
            ))}
          </div>
        </div>

        {/* ── Trust badges ───────────────────────────────────────────────── */}
        <Reveal as="div" direction="none">
          <div className="container mx-auto px-6 py-10 grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { icon: Truck, label: "Nationwide delivery", sub: "Across Nepal" },
              { icon: ShieldCheck, label: "Cash on delivery", sub: "No card needed" },
              { icon: RotateCcw, label: "Easy returns", sub: "Hassle-free" },
            ].map(({ icon: Icon, label, sub }) => (
              <div key={label} className="flex flex-col items-center text-center gap-2 p-4 rounded-xl border border-border/50 bg-card/60 backdrop-blur">
                <div className="size-10 rounded-full bg-accent/10 grid place-items-center">
                  <Icon className="size-4 text-accent" />
                </div>
                <div>
                  <p className="text-xs font-medium">{label}</p>
                  <p className="text-xs text-muted-foreground">{sub}</p>
                </div>
              </div>
            ))}
          </div>
        </Reveal>

        {/* ── Product grid ───────────────────────────────────────────────── */}
        <section id="shop" className="container mx-auto px-6 py-12 md:py-20">
          <Reveal>
            <div className="flex items-end justify-between mb-10">
              <div>
                <p className="text-xs tracking-[0.2em] uppercase text-accent mb-2">Collection</p>
                <h2 className="text-3xl md:text-4xl font-display font-light">The edit</h2>
              </div>
              <Link to="/sale" className="group flex items-center gap-1.5 text-sm text-muted-foreground hover:text-accent transition-colors">
                Sale <ArrowRight className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
              </Link>
            </div>
          </Reveal>

          {/* Category filters */}
          {categories.length > 0 && (
            <Reveal delay={60}>
              <div className="flex flex-wrap gap-2 mb-10">
                <button
                  type="button"
                  onClick={() => setActiveCategory(null)}
                  className={`text-xs px-4 py-2.5 min-h-11 rounded-full tracking-wide transition-all duration-200 border ${
                    activeCategory === null
                      ? "border-foreground bg-foreground text-background"
                      : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground"
                  }`}
                >
                  All
                </button>
                {categories.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setActiveCategory(c)}
                    className={`text-xs px-4 py-2.5 min-h-11 rounded-full tracking-wide transition-all duration-200 border ${
                      activeCategory === c
                        ? "border-accent bg-accent text-accent-foreground"
                        : "border-border text-muted-foreground hover:border-accent/50 hover:text-foreground"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </Reveal>
          )}

          {loading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-5 gap-y-12">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i}>
                  <div className="aspect-[3/4] rounded-xl skeleton" />
                  <div className="mt-4 h-3 skeleton rounded w-3/4" />
                  <div className="mt-2 h-3 skeleton rounded w-1/3" />
                </div>
              ))}
            </div>
          ) : visibleProducts.length === 0 ? (
            <p className="text-muted-foreground text-sm py-20 text-center">
              {products.length === 0 ? "No products yet — check back soon." : "No products in this category yet."}
            </p>
          ) : (
            <div ref={gridRef} className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-5 gap-y-14">
              {visibleProducts.map((p, i) => {
                const outOfStock = p.stock_quantity === 0;
                const displayPrice = p.on_sale && p.sale_price ? p.sale_price : p.price;
                return (
                  <Reveal key={p.id} delay={(i % 8) * 55}>
                    <Link to="/product/$slug" params={{ slug: slugify(p.name) }} className="group block">
                      {/* Image */}
                      <div className="relative aspect-[3/4] bg-[oklch(0.95_0.010_60)] overflow-hidden rounded-xl">
                        {p.image_url ? (
                          <>
                            <img
                              src={p.image_url}
                              alt={p.name}
                              loading="lazy"
                              decoding="async"
                              className={`absolute inset-0 w-full h-full object-cover transition-all duration-700 ease-out group-hover:scale-[1.06] ${hoverImages[p.id] ? "group-hover:opacity-0" : ""} ${outOfStock ? "opacity-40 grayscale" : ""}`}
                            />
                            {hoverImages[p.id] && (
                              <img
                                src={hoverImages[p.id]}
                                alt=""
                                loading="lazy"
                                decoding="async"
                                className="absolute inset-0 w-full h-full object-cover opacity-0 scale-[1.04] transition-all duration-700 ease-out group-hover:opacity-100 group-hover:scale-[1.06]"
                              />
                            )}
                          </>
                        ) : (
                          <div className="w-full h-full grid place-items-center text-muted-foreground/40 text-xs tracking-widest uppercase">No image</div>
                        )}
                        {/* Hover overlay */}
                        {!outOfStock && (
                          <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/8 transition-colors duration-500 rounded-xl" />
                        )}
                        {/* Badges */}
                        {outOfStock && (
                          <span className="absolute top-3 left-3 bg-background/90 backdrop-blur text-muted-foreground text-[10px] font-medium px-2.5 py-1 rounded-full tracking-wide">
                            Sold out
                          </span>
                        )}
                        {p.on_sale && p.sale_price && !outOfStock && (
                          <span className="absolute top-3 left-3 bg-accent text-accent-foreground text-[10px] font-medium px-2.5 py-1 rounded-full tracking-wide">
                            −{Math.round((1 - p.sale_price / p.price) * 100)}%
                          </span>
                        )}
                        {/* Quick-view hint */}
                        {!outOfStock && (
                          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-background/90 backdrop-blur text-[10px] font-medium px-3 py-1.5 rounded-full tracking-widest uppercase opacity-0 group-hover:opacity-100 translate-y-1 group-hover:translate-y-0 transition-all duration-300 whitespace-nowrap">
                            View piece
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="mt-4 px-0.5">
                        <h3 className="text-sm font-light leading-snug transition-colors duration-200 group-hover:text-accent">
                          {p.name}
                        </h3>
                        <div className="mt-1 text-sm tabular-nums">
                          {p.on_sale && p.sale_price ? (
                            <span className="flex items-center gap-2">
                              <span className="text-muted-foreground line-through text-xs">NRS {p.price}</span>
                              <span className="text-accent font-medium">NRS {p.sale_price}</span>
                            </span>
                          ) : (
                            <span className="text-muted-foreground">NRS {displayPrice}</span>
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

        {/* ── About / Brand story ────────────────────────────────────────── */}
        {about.title && (
          <section className="border-t border-border/50 mt-8">
            <div className="container mx-auto px-6 py-24 grid md:grid-cols-2 gap-16 items-center">
              {about.image && (
                <Reveal direction="none" className="relative order-first md:order-none">
                  <div className="aspect-[4/5] rounded-2xl overflow-hidden shadow-xl">
                    <img src={about.image} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
                  </div>
                  {/* Decorative frame */}
                  <div className="absolute -bottom-4 -right-4 -z-10 w-full h-full border border-accent/30 rounded-2xl" />
                </Reveal>
              )}
              <Reveal delay={100}>
                <p className="text-xs tracking-[0.2em] uppercase text-accent mb-4">Our story</p>
                <h2 className="text-4xl md:text-5xl font-display font-light leading-snug">{about.title}</h2>
                {about.body && (
                  <p className="mt-6 text-muted-foreground leading-relaxed font-light whitespace-pre-line">{about.body}</p>
                )}
                <a href="#shop" className="inline-flex items-center gap-2 mt-8 text-sm font-medium border-b border-foreground/30 pb-0.5 hover:border-accent hover:text-accent transition-colors">
                  Shop the collection <ArrowRight className="size-3.5" />
                </a>
              </Reveal>
            </div>
          </section>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
