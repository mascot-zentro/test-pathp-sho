import { createFileRoute, Link } from "@tanstack/react-router";
import { slugify } from "@/lib/slugify";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { Reveal } from "@/components/reveal";
import { LazyImageFill } from "@/components/lazy-image";
import { Truck, ShieldCheck, RotateCcw, Sparkles, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "The Aavira — Premium Women's Fashion Nepal" },
      { name: "description", content: "Curated premium women's fashion. Cash on delivery across Nepal." },
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
  "New arrivals", "Cash on delivery", "Nationwide shipping",
  "Curated styles", "Premium quality", "Fresh drops",
  "New arrivals", "Cash on delivery", "Nationwide shipping",
  "Curated styles", "Premium quality", "Fresh drops",
];

const PAGE_SIZE = 12;

function Index() {
  const [products, setProducts] = useState<Product[]>([]);
  const [hoverImages, setHoverImages] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [hero, setHero] = useState({
    title: "Dress the story\nyou want to tell.",
    subtitle: "A curated edit for the woman who knows herself. Cash on delivery, nationwide.",
    image: "",
  });
  const [about, setAbout] = useState({ title: "", body: "", image: "" });
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const heroImgRef = useRef<HTMLImageElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const fetchPage = async (from: number, append = false) => {
    const { data, count } = await supabase
      .from("products")
      .select("id,name,price,sale_price,on_sale,image_url,stock_quantity,category", { count: "exact" })
      .eq("active", true)
      .order("created_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    const list = (data as Product[]) ?? [];
    setProducts((prev) => append ? [...prev, ...list] : list);
    if (count !== null) setTotal(count);
    if (list.length > 0) {
      supabase
        .from("product_images")
        .select("product_id,image_url")
        .in("product_id", list.map((p) => p.id))
        .eq("position", 1)
        .then(({ data: imgs }) => {
          const map: Record<string, string> = {};
          (imgs ?? []).forEach((r: { product_id: string; image_url: string }) => { map[r.product_id] = r.image_url; });
          setHoverImages((prev) => ({ ...prev, ...map }));
        });
    }
  };

  useEffect(() => {
    const node = heroImgRef.current;
    if (!hero.image || !node) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let ctx: { revert: () => void } | undefined;
    Promise.all([import("gsap"), import("gsap/ScrollTrigger")]).then(([{ gsap }, { ScrollTrigger }]) => {
      gsap.registerPlugin(ScrollTrigger);
      ctx = gsap.context(() => {
        gsap.to(node, {
          yPercent: 28,
          ease: "none",
          scrollTrigger: { trigger: node.closest("section"), start: "top top", end: "bottom top", scrub: true },
        });
      });
    });
    return () => ctx?.revert();
  }, [hero.image]);

  useEffect(() => {
    setLoading(true);
    fetchPage(0).finally(() => setLoading(false)); // eslint-disable-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    supabase
      .from("app_settings").select("key,value")
      .in("key", ["hero_title", "hero_subtitle", "hero_image_url", "about_title", "about_body", "about_image_url"])
      .then(({ data }) => {
        const obj: Record<string, string> = {};
        (data ?? []).forEach((r) => { if (r.value) obj[r.key] = r.value; });
        setHero((h) => ({ title: obj.hero_title || h.title, subtitle: obj.hero_subtitle || h.subtitle, image: obj.hero_image_url || "" }));
        setAbout({ title: obj.about_title || "", body: obj.about_body || "", image: obj.about_image_url || "" });
      });
  }, []);

  const handleLoadMore = async () => {
    setLoadingMore(true);
    await fetchPage(products.length, true);
    setLoadingMore(false);
  };

  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => { if (p.category) set.add(p.category); });
    return [...set];
  }, [products]);

  const visibleProducts = activeCategory ? products.filter((p) => p.category === activeCategory) : products;
  const hasMore = !activeCategory && products.length < total;

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid || visibleProducts.length === 0) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const cards = grid.querySelectorAll<HTMLElement>(":scope > *");
    import("gsap").then(({ gsap }) => {
      gsap.fromTo(cards,
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.5, ease: "power2.out", stagger: 0.06, clearProps: "opacity,transform" },
      );
    });
  }, [visibleProducts]);

  return (
    <div className="min-h-screen flex flex-col bg-background page-enter">
      <SiteNav />
      <main className="flex-1">

        {/* ── HERO ─────────────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden min-h-[90vh] flex items-center grain">
          {hero.image ? (
            <>
              <div className="absolute inset-0 overflow-hidden -z-10">
                <img ref={heroImgRef} src={hero.image} alt="" fetchPriority="high" decoding="async"
                  className="w-full h-[120%] object-cover will-change-transform" />
              </div>
              <div className="absolute inset-0 -z-10 bg-linear-to-r from-background/95 via-background/60 to-background/20" />
              <div className="absolute inset-0 -z-10 bg-linear-to-t from-background/80 via-transparent to-transparent" />
            </>
          ) : (
            <div className="absolute inset-0 -z-10">
              <div className="absolute inset-0 bg-linear-to-br from-[oklch(0.96_0.018_358)] via-background to-[oklch(0.97_0.012_60)]" />
              <div className="absolute top-0 left-0 w-175 h-175 rounded-full bg-[oklch(0.88_0.05_358/0.25)] blur-[140px] -translate-x-1/3 -translate-y-1/3" />
              <div className="absolute bottom-0 right-0 w-125 h-125 rounded-full bg-[oklch(0.90_0.04_45/0.2)] blur-[120px] translate-x-1/4 translate-y-1/4" />
            </div>
          )}

          <div className="container mx-auto px-6 py-24 md:py-32 grid md:grid-cols-[1fr_auto] gap-12 items-center w-full">
            <div className="max-w-2xl">

              <Reveal delay={70}>
                <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-display font-light leading-none tracking-tight whitespace-pre-line">
                  {hero.title}
                </h1>
              </Reveal>

              <Reveal delay={160}>
                <p className="mt-7 text-base md:text-lg text-muted-foreground max-w-md leading-relaxed font-light">
                  {hero.subtitle}
                </p>
              </Reveal>

              <Reveal delay={240}>
                <div className="mt-10 flex flex-wrap gap-3">
                  <a href="#shop"
                    className="group inline-flex items-center gap-2 px-8 py-4 rounded-full bg-foreground text-background text-sm font-medium tracking-wide transition-all duration-300 hover:bg-accent hover:shadow-[0_8px_40px_oklch(0.62_0.14_358/0.4)] hover:scale-[1.02] active:scale-[0.98]">
                    Shop collection
                    <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-1" />
                  </a>
                  <Link to="/sale"
                    className="inline-flex items-center gap-2 px-8 py-4 rounded-full border border-foreground/20 text-sm font-medium tracking-wide transition-all duration-200 hover:border-accent hover:text-accent hover:bg-accent/5">
                    View sale
                  </Link>
                </div>
              </Reveal>
            </div>

            {/* Hero product card — desktop only */}
            {!loading && products[0]?.image_url && (
              <Reveal delay={100} direction="none">
                <Link to="/product/$slug" params={{ slug: slugify(products[0].name) }}
                  className="group hidden lg:block w-64 xl:w-72 shrink-0">
                  <div className="relative aspect-3/4 rounded-2xl overflow-hidden shadow-2xl ring-1 ring-foreground/8">
                    <img src={products[0].image_url ?? ""} alt={products[0].name} loading="eager" decoding="async"
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                    <div className="absolute inset-0 bg-linear-to-t from-foreground/70 via-foreground/10 to-transparent" />
                    <div className="absolute bottom-0 inset-x-0 p-5">
                      <p className="text-background font-display text-lg leading-snug">{products[0].name}</p>
                      <p className="text-background/70 text-sm mt-0.5">
                        NRS {products[0].on_sale && products[0].sale_price ? products[0].sale_price : products[0].price}
                      </p>
                    </div>
                    <div className="absolute top-3 right-3 bg-accent text-accent-foreground text-[10px] font-medium px-3 py-1.5 rounded-full animate-float shadow-lg">
                      Just in ✦
                    </div>
                  </div>
                </Link>
              </Reveal>
            )}
          </div>
        </section>

        {/* ── MARQUEE ───────────────────────────────────────────────────────── */}
        <div className="overflow-hidden border-y border-border/60 bg-foreground py-4">
          <div className="flex whitespace-nowrap animate-marquee">
            {MARQUEE_ITEMS.map((item, i) => (
              <span key={i} className="inline-flex items-center gap-5 px-8 text-[11px] font-medium tracking-[0.22em] uppercase text-background/60">
                {item} <span className="text-background/25">✦</span>
              </span>
            ))}
          </div>
        </div>

        {/* ── TRUST BADGES ──────────────────────────────────────────────────── */}
        <Reveal as="div" direction="none">
          <div className="container mx-auto px-6 py-14">
            <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-border/50 border border-border/50 rounded-2xl overflow-hidden bg-card/60">
              {[
                { icon: Truck, label: "Nationwide delivery", sub: "Delivered across all of Nepal" },
                { icon: ShieldCheck, label: "Cash on delivery", sub: "Pay when you receive — no card needed" },
                { icon: RotateCcw, label: "Easy returns", sub: "Hassle-free return process" },
              ].map(({ icon: Icon, label, sub }) => (
                <div key={label} className="flex items-center gap-4 p-7">
                  <div className="size-10 rounded-full bg-accent/10 grid place-items-center shrink-0">
                    <Icon className="size-4 text-accent" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{sub}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Reveal>

        {/* ── PRODUCT GRID ──────────────────────────────────────────────────── */}
        <section id="shop" className="container mx-auto px-6 pb-28">
          <Reveal>
            <div className="flex items-end justify-between mb-12">
              <div>
                <p className="text-[11px] tracking-[0.25em] uppercase text-accent mb-3">Collection</p>
                <h2 className="text-3xl md:text-5xl font-display font-light">The edit</h2>
              </div>
              <Link to="/sale" className="group flex items-center gap-1.5 text-sm text-muted-foreground hover:text-accent transition-colors">
                Sale <ArrowRight className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
              </Link>
            </div>
          </Reveal>

          {categories.length > 0 && (
            <Reveal delay={60}>
              <div className="flex flex-wrap gap-2 mb-10">
                {[null, ...categories].map((c) => (
                  <button key={c ?? "__all"} type="button" onClick={() => setActiveCategory(c)}
                    className={`text-xs px-5 py-2.5 rounded-full tracking-wide transition-all duration-200 border ${
                      activeCategory === c
                        ? c === null ? "border-foreground bg-foreground text-background" : "border-accent bg-accent text-accent-foreground"
                        : "border-border/60 text-muted-foreground hover:border-foreground/40 hover:text-foreground"
                    }`}>
                    {c ?? "All"}
                  </button>
                ))}
              </div>
            </Reveal>
          )}

          {loading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-12">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i}>
                  <div className="aspect-3/4 rounded-2xl skeleton" />
                  <div className="mt-4 h-3 skeleton rounded-full w-3/4" />
                  <div className="mt-2 h-3 skeleton rounded-full w-1/3" />
                </div>
              ))}
            </div>
          ) : visibleProducts.length === 0 ? (
            <p className="text-muted-foreground text-sm py-24 text-center">
              {products.length === 0 ? "No products yet — check back soon." : "No products in this category."}
            </p>
          ) : (
            <div ref={gridRef} className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-12 md:gap-x-6 md:gap-y-16">
              {visibleProducts.map((p, i) => {
                const outOfStock = p.stock_quantity === 0;
                const displayPrice = p.on_sale && p.sale_price ? p.sale_price : p.price;
                return (
                  <Reveal key={p.id} delay={(i % 8) * 50}>
                    <Link to="/product/$slug" params={{ slug: slugify(p.name) }} className="group block">
                      <div className="relative aspect-3/4 overflow-hidden rounded-2xl">
                        {p.image_url ? (
                          <>
                            <LazyImageFill src={p.image_url} alt={p.name}
                              fetchPriority={i < 4 ? "high" : "auto"}
                              className={`object-cover transition-all duration-700 ease-out group-hover:scale-[1.06] ${hoverImages[p.id] ? "group-hover:opacity-0" : ""} ${outOfStock ? "opacity-40 grayscale" : ""}`} />
                            {hoverImages[p.id] && (
                              <img src={hoverImages[p.id] ?? ""} alt="" loading="lazy" decoding="async"
                                className="absolute inset-0 w-full h-full object-cover opacity-0 scale-[1.04] transition-all duration-700 ease-out group-hover:opacity-100 group-hover:scale-[1.06]" />
                            )}
                          </>
                        ) : (
                          <div className="w-full h-full bg-[oklch(0.95_0.010_60)] grid place-items-center text-muted-foreground/30 text-xs tracking-widest uppercase">No image</div>
                        )}

                        {!outOfStock && (
                          <div className="absolute inset-0 bg-linear-to-t from-foreground/20 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                        )}

                        {outOfStock && (
                          <span className="absolute top-3 left-3 bg-background/95 backdrop-blur-sm text-muted-foreground text-[10px] font-medium px-3 py-1.5 rounded-full">
                            Sold out
                          </span>
                        )}
                        {p.on_sale && p.sale_price && !outOfStock && (
                          <span className="absolute top-3 left-3 bg-accent text-accent-foreground text-[10px] font-semibold px-3 py-1.5 rounded-full">
                            −{Math.round((1 - p.sale_price / p.price) * 100)}%
                          </span>
                        )}

                        {!outOfStock && (
                          <div className="absolute bottom-3 inset-x-0 flex justify-center">
                            <span className="bg-background/95 backdrop-blur-sm text-[10px] font-medium px-4 py-2 rounded-full tracking-widest uppercase shadow-md opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 whitespace-nowrap">
                              View piece
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="mt-4 px-0.5">
                        <h3 className="text-sm font-light leading-snug group-hover:text-accent transition-colors duration-200 line-clamp-2">
                          {p.name}
                        </h3>
                        <div className="mt-1.5 text-sm tabular-nums">
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

          {hasMore && (
            <div className="flex justify-center mt-16">
              <button type="button" onClick={handleLoadMore} disabled={loadingMore}
                className="group inline-flex items-center gap-2.5 px-10 py-4 rounded-full border border-foreground/20 text-sm font-medium tracking-wide transition-all duration-300 hover:border-accent hover:text-accent hover:bg-accent/5 disabled:opacity-40">
                {loadingMore
                  ? <><span className="size-4 rounded-full border-2 border-current border-t-transparent animate-spin" />Loading…</>
                  : <><span>Load more</span><span className="text-muted-foreground/60">· {total - products.length} remaining</span></>
                }
              </button>
            </div>
          )}
          {!hasMore && !loading && products.length > PAGE_SIZE && (
            <p className="text-center text-[11px] text-muted-foreground/50 mt-12 tracking-widest uppercase">
              ✦ All {total} pieces shown ✦
            </p>
          )}
        </section>

        {/* ── ABOUT / BRAND STORY ───────────────────────────────────────────── */}
        {about.title && (
          <section className="border-t border-border/40 bg-[oklch(0.14_0.012_40)]">
            <div className="container mx-auto px-6 py-20 md:py-28 grid md:grid-cols-2 gap-12 md:gap-20 items-center">

              {/* Image side */}
              <Reveal direction="none" className="order-first md:order-0">
                {about.image ? (
                  <div className="relative aspect-3/4 rounded-2xl overflow-hidden shadow-2xl">
                    <img src={about.image} alt={about.title} loading="lazy" decoding="async"
                      className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-linear-to-t from-black/40 to-transparent" />
                  </div>
                ) : (
                  /* Elegant brand card when no image */
                  <div className="aspect-3/4 rounded-2xl overflow-hidden bg-linear-to-br from-[oklch(0.20_0.015_40)] to-[oklch(0.12_0.010_40)] border border-white/6 flex flex-col items-center justify-center gap-8 p-10 relative">
                    <div className="absolute inset-6 border border-[rgba(196,152,60,0.2)] rounded-xl pointer-events-none" />
                    <div className="text-center space-y-4 relative z-10">
                      <p className="font-display text-5xl font-light tracking-[0.3em] text-[rgba(240,220,180,0.9)]">
                        THE<br />AAVIRA
                      </p>
                      <div className="flex items-center gap-3 justify-center">
                        <div className="h-px w-12 bg-[rgba(196,152,60,0.5)]" />
                        <div className="size-1.5 rotate-45 bg-[rgba(196,152,60,0.7)]" />
                        <div className="h-px w-12 bg-[rgba(196,152,60,0.5)]" />
                      </div>
                      <p className="text-[10px] tracking-[0.3em] uppercase text-[rgba(196,152,60,0.55)]">
                        Women's Fashion · Nepal
                      </p>
                    </div>
                    {/* Stats */}
                    <div className="grid grid-cols-3 gap-4 w-full relative z-10 border-t border-white/8 pt-8">
                      {[{ n: "500+", l: "Customers" }, { n: "77", l: "Districts" }, { n: "100%", l: "Authentic" }].map(({ n, l }) => (
                        <div key={l} className="text-center">
                          <p className="font-display text-2xl font-light text-[rgba(240,220,180,0.85)]">{n}</p>
                          <p className="text-[10px] tracking-wide uppercase text-[rgba(196,152,60,0.5)] mt-1">{l}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Reveal>

              {/* Text side */}
              <Reveal delay={100}>
                <p className="text-[11px] tracking-[0.25em] uppercase text-accent/70 mb-5">Our story</p>
                <h2 className="text-4xl md:text-5xl lg:text-6xl font-display font-light leading-tight text-[oklch(0.94_0.006_60)]">
                  {about.title}
                </h2>
                {about.body && (
                  <p className="mt-6 text-[oklch(0.60_0.008_60)] leading-relaxed font-light text-base md:text-lg whitespace-pre-line">
                    {about.body}
                  </p>
                )}

                {/* Feature points */}
                <div className="mt-10 space-y-4">
                  {[
                    { icon: Sparkles, t: "Curated with care", s: "Every piece hand-picked for quality and style." },
                    { icon: Truck, t: "Delivered nationwide", s: "Reach every district across Nepal." },
                    { icon: ShieldCheck, t: "Cash on delivery", s: "Pay when it arrives — zero risk." },
                  ].map(({ icon: Icon, t, s }) => (
                    <div key={t} className="flex items-start gap-4">
                      <div className="size-9 rounded-full bg-accent/15 grid place-items-center shrink-0 mt-0.5">
                        <Icon className="size-3.5 text-accent" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-[oklch(0.88_0.006_60)]">{t}</p>
                        <p className="text-xs text-[oklch(0.52_0.008_60)] mt-0.5">{s}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <a href="#shop"
                  className="group inline-flex items-center gap-2 mt-10 px-8 py-4 rounded-full bg-accent text-accent-foreground text-sm font-medium tracking-wide transition-all duration-300 hover:shadow-[0_8px_30px_oklch(0.62_0.14_358/0.4)] hover:scale-[1.02]">
                  Shop the collection
                  <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                </a>
              </Reveal>
            </div>
          </section>
        )}

        {/* ── INSTAGRAM FEED ────────────────────────────────────────────────── */}
        <section className="border-t border-border/40 py-20 md:py-28">
          <div className="container mx-auto px-6">
            <Reveal className="text-center mb-12">
              <p className="text-[10px] font-medium uppercase tracking-[0.3em] text-accent mb-3">Follow along</p>
              <h2 className="font-display text-4xl font-light">
                <a
                  href="https://www.instagram.com/the_aavira/"
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-accent transition-colors duration-200"
                >
                  @the_aavira
                </a>
              </h2>
            </Reveal>
            <Reveal delay={80}>
              {/* @ts-expect-error — behold-widget is a custom element loaded via CDN */}
              <behold-widget feed-id="XoQJy9h8oCAT03Pb30kJ" />
            </Reveal>
            <div className="mt-10 text-center">
              <a
                href="https://www.instagram.com/the_aavira/"
                target="_blank"
                rel="noreferrer"
                className="group inline-flex items-center gap-2 px-8 py-3.5 rounded-full border border-border/60 text-sm font-medium tracking-wide text-muted-foreground transition-all duration-300 hover:border-accent hover:text-accent hover:bg-accent/5"
              >
                View all on Instagram
                <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
              </a>
            </div>
          </div>
        </section>

      </main>
      <SiteFooter />
    </div>
  );
}
