import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { createServerFn, useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { MessageCircle, Copy, Facebook, ZoomIn, Ruler, Heart, Truck, RotateCcw, ShieldCheck, Package, Sparkles, Loader2 } from "lucide-react";
import { slugify } from "@/lib/slugify";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCart } from "@/lib/cart";
import { toggleWishlist, isWishlisted } from "@/lib/wishlist";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { LazyImageFill } from "@/components/lazy-image";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AIChat } from "@/components/ai-chat";
import { getAISizeRecommendation, getAIRecommendations } from "@/lib/ai.functions";
import { trackViewContent, trackAddToCart } from "@/lib/meta-pixel";

// ── Server fetch for SSR OG tags ────────────────────────────────────────────
const fetchProductMeta = createServerFn({ method: "GET" })
  .validator((slug: string) => slug)
  .handler(async ({ data: slug }) => {
    const { supabase } = await import("@/integrations/supabase/client");
    const { slugify: sl } = await import("@/lib/slugify");
    const { data } = await supabase.from("products").select("name,description,price,sale_price,on_sale,image_url").eq("active", true);
    type PMeta = { name: string; description: string | null; price: number; sale_price: number | null; on_sale: boolean; image_url: string | null };
    const product = (data ?? []).find((p: PMeta) => sl(p.name) === slug) as PMeta | undefined;
    return product ?? null;
  });

// ── Recently Viewed ──────────────────────────────────────────────────────────
const RV_KEY = "recently_viewed";
const RV_MAX = 6;

type RVItem = { id: string; name: string; price: number; sale_price: number | null; on_sale: boolean; image_url: string | null };

function getRV(): RVItem[] {
  try { return JSON.parse(localStorage.getItem(RV_KEY) ?? "[]"); } catch { return []; }
}

function pushRV(item: RVItem) {
  const list = getRV().filter((p) => p.id !== item.id);
  list.unshift(item);
  localStorage.setItem(RV_KEY, JSON.stringify(list.slice(0, RV_MAX)));
}

export const Route = createFileRoute("/product/$slug")({
  loader: async ({ params }) => {
    const meta = await fetchProductMeta({ data: params.slug });
    return { meta };
  },
  head: ({ loaderData, params }) => {
    const p = loaderData?.meta;
    if (!p) return {};
    const price = p.on_sale && p.sale_price ? p.sale_price : p.price;
    const title = `${p.name} — NRS ${price} | The Aavira`;
    const desc = p.description
      ? p.description.slice(0, 155)
      : `Buy ${p.name} for NRS ${price}. Women's tops & kurtas, cash on delivery across Nepal.`;
    const pageUrl = `https://www.theaavira.com/product/${params.slug}`;
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:type", content: "product" },
        { property: "og:url", content: pageUrl },
        { property: "og:site_name", content: "The Aavira" },
        { property: "og:locale", content: "en_US" },
        ...(p.image_url ? [
          { property: "og:image", content: p.image_url },
          { name: "twitter:image", content: p.image_url },
          { name: "twitter:card", content: "summary_large_image" },
        ] : []),
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: desc },
      ],
      links: [
        { rel: "canonical", href: pageUrl },
      ],
    };
  },
  component: ProductPage,
});

function useProductSEO(product: { name: string; description: string | null; price: number; sale_price: number | null; on_sale: boolean; image_url: string | null; stock_quantity: number | null } | null) {
  useEffect(() => {
    if (!product) return;
    const price = product.on_sale && product.sale_price ? product.sale_price : product.price;
    const title = `${product.name} — NRS ${price}`;
    const desc = product.description
      ? product.description.slice(0, 155)
      : `Buy ${product.name} for NRS ${price}. Cash on delivery, nationwide.`;
    const image = product.image_url ?? "";
    const siteUrl = window.location.origin;

    document.title = title;

    const set = (sel: string, attr: string, val: string) => {
      let el = document.querySelector<HTMLMetaElement>(sel);
      if (!el) { el = document.createElement("meta"); document.head.appendChild(el); }
      el.setAttribute(attr, val);
    };

    set('meta[name="description"]', "content", desc);
    set('meta[property="og:title"]', "content", title);
    set('meta[property="og:description"]', "content", desc);
    set('meta[property="og:type"]', "content", "product");
    set('meta[property="og:url"]', "content", window.location.href);
    set('meta[property="og:site_name"]', "content", "The Aavira");
    if (image) set('meta[property="og:image"]', "content", image);
    set('meta[name="twitter:title"]', "content", title);
    set('meta[name="twitter:description"]', "content", desc);
    if (image) set('meta[name="twitter:image"]', "content", image);

    // canonical
    let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = window.location.href.split("?")[0];

    // JSON-LD Product schema — helps Google show price + availability in results
    const availability = product.stock_quantity === 0
      ? "https://schema.org/OutOfStock"
      : "https://schema.org/InStock";

    const productJsonLd = {
      "@context": "https://schema.org",
      "@type": "Product",
      name: product.name,
      description: desc,
      image: image || undefined,
      url: window.location.href,
      brand: { "@type": "Brand", name: "The Aavira" },
      offers: {
        "@type": "Offer",
        url: window.location.href,
        priceCurrency: "NPR",
        price: price,
        availability,
        seller: { "@type": "Organization", name: "The Aavira", url: siteUrl },
      },
    };

    const breadcrumbJsonLd = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: siteUrl },
        ...(product.category ? [{ "@type": "ListItem", position: 2, name: product.category, item: siteUrl }] : []),
        { "@type": "ListItem", position: product.category ? 3 : 2, name: product.name, item: window.location.href },
      ],
    };

    const setScript = (id: string, data: object) => {
      let script = document.getElementById(id) as HTMLScriptElement | null;
      if (!script) {
        script = document.createElement("script");
        script.id = id;
        script.type = "application/ld+json";
        document.head.appendChild(script);
      }
      script.textContent = JSON.stringify(data);
    };

    setScript("product-jsonld", productJsonLd);
    setScript("breadcrumb-jsonld", breadcrumbJsonLd);

    return () => {
      document.getElementById("product-jsonld")?.remove();
      document.getElementById("breadcrumb-jsonld")?.remove();
    };
  }, [product]);
}

type Product = {
  id: string; name: string; description: string | null; price: number;
  sale_price: number | null; on_sale: boolean; image_url: string | null;
  whatsapp_number: string | null; stock_quantity: number | null; category: string | null; weight: number;
};
type Size = { id: string; name: string; stock_quantity: number | null };
type RelatedProduct = {
  id: string; name: string; price: number; sale_price: number | null;
  on_sale: boolean; image_url: string | null; stock_quantity: number | null; category: string | null;
};

function ProductPage() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();
  const { addItem: addToCart } = useCart();
  const [product, setProduct] = useState<Product | null>(null);
  useProductSEO(product);
  const [notFound, setNotFound] = useState(false);
  const [sizes, setSizes] = useState<Size[]>([]);
  const [gallery, setGallery] = useState<string[]>([]);
  const [activeImage, setActiveImage] = useState(0);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [defaultWa, setDefaultWa] = useState("");
  const [related, setRelated] = useState<RelatedProduct[]>([]);
  const [recentlyViewed, setRecentlyViewed] = useState<RVItem[]>([]);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [zoomPos, setZoomPos] = useState({ x: 50, y: 50 });
  const [wishlisted, setWishlisted] = useState(false);
  const imgRef = useRef<HTMLDivElement>(null);

  // AI state
  const getSize = useServerFn(getAISizeRecommendation);
  const getRecommendations = useServerFn(getAIRecommendations);
  const [aiMeasurements, setAiMeasurements] = useState({ bust: "", waist: "", hips: "" });
  const [aiSizeResult, setAiSizeResult] = useState<{ size: string; confidence: string; reason: string } | null>(null);
  const [aiSizeLoading, setAiSizeLoading] = useState(false);
  const [aiRecommendedIds, setAiRecommendedIds] = useState<string[]>([]);

  const [vatEnabled, setVatEnabled] = useState(false);

  // Social proof state
  const [viewerCount, setViewerCount] = useState(0);
  const [ordersToday, setOrdersToday] = useState(0);
  const [recentBuyer, setRecentBuyer] = useState<{ name: string; product: string; time: string } | null>(null);
  const [buyerPopupVisible, setBuyerPopupVisible] = useState(false);

  useEffect(() => {
    // Fetch product + whatsapp setting in parallel, then batch variant queries
    supabase.from("app_settings").select("key,value").eq("key", "vat_enabled").maybeSingle()
      .then(({ data }) => { setVatEnabled((data as { key: string; value: string | null } | null)?.value === "true"); });

    Promise.all([
      supabase.from("products").select("*").eq("active", true),
      supabase.from("app_settings").select("value").eq("key", "whatsapp_number").maybeSingle(),
    ]).then(([{ data }, { data: waSetting }]) => {
      setDefaultWa(waSetting?.value ?? "");
      const all = (data as Product[]) ?? [];
      const match = all.find((p) => slugify(p.name) === slug) ?? null;
      if (!match) { setNotFound(true); return; }
      setProduct(match);
      const id = match.id;
      // Batch all variant queries in parallel
      Promise.all([
        supabase.from("product_sizes").select("*").eq("product_id", id).order("position"),
        supabase.from("product_images").select("image_url").eq("product_id", id).order("position"),
      ]).then(([{ data: sd }, { data: gd }]) => {
        const sizeList = (sd as Size[]) ?? [];
        setSizes(sizeList);
        setSelectedSize((sizeList.find((s) => s.stock_quantity !== 0) ?? sizeList[0])?.name ?? null);
        setGallery((gd ?? []).map((r: { image_url: string }) => r.image_url));
        setActiveImage(0);
      });
    });
  }, [slug]);

  useEffect(() => {
    if (!product) return;
    pushRV({ id: product.id, name: product.name, price: product.price, sale_price: product.sale_price, on_sale: product.on_sale, image_url: product.image_url });
    setRecentlyViewed(getRV().filter((p) => p.id !== product.id).slice(0, 4));
    setWishlisted(isWishlisted(product.id));
    trackViewContent({ id: product.id, name: product.name, price: product.on_sale && product.sale_price ? product.sale_price : product.price });
  }, [product?.id]);

  useEffect(() => {
    if (!product) return;
    supabase.from("products")
      .select("id,name,price,sale_price,on_sale,image_url,stock_quantity,category")
      .eq("active", true).neq("id", product.id).limit(20)
      .then(async ({ data }) => {
        const list = (data as RelatedProduct[]) ?? [];
        setRelated(list.slice(0, 4));
        // Ask AI to reorder for relevance (fire and forget, updates when ready)
        try {
          const ids = await getRecommendations({
            data: {
              currentProduct: { name: product.name, category: product.category, price: product.price },
              candidates: list.map((p) => ({ id: p.id, name: p.name, category: p.category, price: p.price })),
            },
          });
          setAiRecommendedIds(ids);
        } catch { /* keep default order */ }
      });
  }, [product?.id, product?.category]);

  // ── Social proof effects ───────────────────────────────────────────────────

  // Viewer count: seed a realistic number, fluctuate every 30s
  useEffect(() => {
    if (!product) return;
    const seed = (product.id.charCodeAt(0) + product.id.charCodeAt(1)) % 12;
    setViewerCount(6 + seed);
    const interval = setInterval(() => {
      setViewerCount((v) => Math.max(3, v + (Math.random() > 0.5 ? 1 : -1)));
    }, 30_000);
    return () => clearInterval(interval);
  }, [product?.id]);

  // Orders today: real count from Supabase
  useEffect(() => {
    if (!product) return;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    supabase.from("orders")
      .select("id", { count: "exact", head: true })
      .eq("product_id", product.id)
      .neq("status", "cancelled")
      .gte("created_at", todayStart.toISOString())
      .then(({ count }) => setOrdersToday(count ?? 0));
  }, [product?.id]);

  // Recent buyer popup: pull last 10 real orders, cycle through them
  useEffect(() => {
    if (!product) return;
    supabase.from("orders")
      .select("customer_name, product_name, created_at")
      .eq("product_id", product.id)
      .neq("status", "cancelled")
      .order("created_at", { ascending: false })
      .limit(10)
      .then(({ data }) => {
        if (!data || data.length === 0) return;
        let idx = 0;
        const show = () => {
          const o = data[idx % data.length];
          const diff = Math.round((Date.now() - new Date(o.created_at).getTime()) / 60000);
          const timeLabel = diff < 60 ? `${diff}m ago` : diff < 1440 ? `${Math.round(diff / 60)}h ago` : `${Math.round(diff / 1440)}d ago`;
          const firstName = o.customer_name?.split(" ")[0] ?? "Someone";
          setRecentBuyer({ name: firstName, product: o.product_name, time: timeLabel });
          setBuyerPopupVisible(true);
          setTimeout(() => setBuyerPopupVisible(false), 5000);
          idx++;
        };
        const timer = setTimeout(show, 8000);
        const interval = setInterval(show, 25000);
        return () => { clearTimeout(timer); clearInterval(interval); };
      });
  }, [product?.id]);


  if (notFound) return (
    <div className="min-h-screen flex flex-col"><SiteNav />
      <div className="container mx-auto px-6 py-20 text-center">
        <p className="text-4xl font-display font-light mb-4">Product not found</p>
        <Link to="/" className="text-sm text-accent hover:underline">← Back to shop</Link>
      </div>
    </div>
  );
  if (!product) return <div className="min-h-screen"><SiteNav /><div className="container mx-auto px-6 py-20 text-muted-foreground animate-pulse">Loading…</div></div>;

  const images = gallery.length > 0 ? gallery : product.image_url ? [product.image_url] : [];
  const price = product.on_sale && product.sale_price ? product.sale_price : product.price;
  // A product's available stock is the most restrictive of its tracked
  // attributes — if either the selected color or selected size has a cap,
  // that cap applies. Untracked (null) axes don't constrain anything.
  const sizeLimit = sizes.length > 0 ? (sizes.find((s) => s.name === selectedSize)?.stock_quantity ?? null) : null;
  const availableStock = sizes.length === 0 ? product.stock_quantity : sizeLimit !== null ? sizeLimit : null;
  const outOfStock = availableStock === 0;
  const lowStock = availableStock !== null && availableStock > 0 && availableStock <= 5;
  const waNumber = (product.whatsapp_number || defaultWa).replace(/\D/g, "");
  const variantLabel = selectedSize ?? "";
  const waMessage = `Hi! I want to order: ${product.name}${variantLabel ? ` (${variantLabel})` : ""} — NRS ${price}`;
  const waLink = !outOfStock && waNumber ? `https://wa.me/${waNumber}?text=${encodeURIComponent(waMessage)}` : null;
  const shareUrl = typeof window !== "undefined" ? window.location.href : "";
  const shareText = `Check out ${product.name} — NRS ${price}`;

  // AI-reordered related products (falls back to default order if AI not ready)
  const sortedRelated = aiRecommendedIds.length > 0
    ? [...related].sort((a, b) => {
        const ai = aiRecommendedIds.indexOf(a.id);
        const bi = aiRecommendedIds.indexOf(b.id);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      })
    : related;

  const handleAISizeCheck = async () => {
    const bust = parseFloat(aiMeasurements.bust);
    const waist = parseFloat(aiMeasurements.waist);
    const hips = parseFloat(aiMeasurements.hips);
    if (!bust || !waist || !hips) { toast.error("Please enter all measurements"); return; }
    setAiSizeLoading(true);
    setAiSizeResult(null);
    try {
      const result = await getSize({
        data: { bust, waist, hips, availableSizes: sizes.map((s) => s.name) },
      });
      setAiSizeResult(result);
    } catch {
      toast.error("AI size check failed. Please use the size chart.");
    } finally {
      setAiSizeLoading(false);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setZoomPos({
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    });
  };

  const handleShare = async (platform: "whatsapp" | "facebook" | "copy" | "social") => {
    if (platform === "whatsapp") {
      window.open(`https://wa.me/?text=${encodeURIComponent(`${shareText} ${shareUrl}`)}`, "_blank");
    } else if (platform === "facebook") {
      window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`, "_blank");
    } else if (platform === "social") {
      // ?from=social opens chat automatically so DM traffic lands on a guided page, not a bare product page
      await navigator.clipboard.writeText(`${shareUrl}${shareUrl.includes("?") ? "&" : "?"}from=social`);
      toast.success("Social link copied! Paste it in your bio/story.");
    } else {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Link copied!");
    }
  };

  return (
    <div className="min-h-screen flex flex-col page-enter">
      <SiteNav />

      {/* ── Recent buyer popup ── */}
      {recentBuyer && (
        <div className={`fixed bottom-6 left-6 z-50 transition-all duration-500 ${buyerPopupVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"}`}>
          <div className="bg-white border border-border shadow-xl rounded-2xl px-4 py-3 flex items-center gap-3 max-w-70">
            <div className="size-9 rounded-full bg-accent/20 flex items-center justify-center text-base shrink-0">🛍️</div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-foreground truncate">{recentBuyer.name} just bought this</p>
              <p className="text-[11px] text-muted-foreground truncate">{recentBuyer.time}</p>
            </div>
          </div>
        </div>
      )}

      <div className="container mx-auto px-6 py-12 grid md:grid-cols-2 gap-12 lg:gap-20 flex-1 items-start">
        {/* ── Image gallery with zoom ── */}
        <div className="md:sticky md:top-[80px]">
          <div
            ref={imgRef}
            className="aspect-[3/4] bg-[oklch(0.95_0.010_60)] rounded-2xl overflow-hidden relative group cursor-zoom-in shadow-lg"
            onMouseMove={handleMouseMove}
            onMouseEnter={() => setZoomOpen(true)}
            onMouseLeave={() => setZoomOpen(false)}
          >
            {images[activeImage] && (
              <>
                <img
                  src={images[activeImage]}
                  alt={product.name}
                  fetchPriority="high"
                  decoding="async"
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                />
                {zoomOpen && (
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      backgroundImage: `url(${images[activeImage]})`,
                      backgroundSize: "260%",
                      backgroundPosition: `${zoomPos.x}% ${zoomPos.y}%`,
                      backgroundRepeat: "no-repeat",
                    }}
                  />
                )}
                <span className="absolute bottom-3 right-3 bg-background/70 backdrop-blur rounded-full p-2 opacity-50 group-hover:opacity-0 transition pointer-events-none">
                  <ZoomIn className="size-3.5" />
                </span>
              </>
            )}
          </div>
          {images.length > 1 && (
            <div className="flex gap-2 mt-4 overflow-x-auto pb-1 scrollbar-none">
              {images.map((url, i) => (
                <button key={i} type="button" onClick={() => setActiveImage(i)}
                  className={`size-16 rounded-lg overflow-hidden border-2 shrink-0 transition-all duration-200 flex-none ${i === activeImage ? "border-accent shadow-sm" : "border-transparent opacity-60 hover:opacity-100"}`}>
                  <img src={url} alt={`${product?.name ?? ""} — view ${i + 1}`} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Product info ── */}
        <TooltipProvider delayDuration={300}>
        <div className="pt-2">
          <Link to="/" className="inline-flex items-center gap-1 text-xs tracking-[0.14em] uppercase text-muted-foreground hover:text-accent transition-colors duration-200">
            ← Shop
          </Link>

          {product.category && (
            <p className="mt-4 text-xs tracking-[0.18em] uppercase text-accent font-medium">{product.category}</p>
          )}
          <h1 className="text-4xl md:text-5xl font-display font-light mt-2 leading-tight">{product.name}</h1>

          <div className="mt-4 flex items-baseline gap-3">
            {product.on_sale && product.sale_price ? (
              <>
                <span className="text-2xl font-light tabular-nums text-accent">NRS {product.sale_price}</span>
                <span className="text-base text-muted-foreground line-through tabular-nums">NRS {product.price}</span>
                <span className="text-xs bg-accent/10 text-accent px-2 py-0.5 rounded-full font-medium">Sale</span>
              </>
            ) : (
              <span className="text-2xl font-light tabular-nums">NRS {product.price}</span>
            )}
          </div>
          {vatEnabled && (
            <p className="mt-1 text-xs text-muted-foreground">Price exclusive of VAT. VAT will be added at checkout.</p>
          )}

          {outOfStock && <p className="mt-3 text-sm font-medium text-destructive tracking-wide">Sold out</p>}
          {!outOfStock && lowStock && (
            <p className="mt-3 text-xs tracking-wide text-amber-600 bg-amber-50 border border-amber-100 px-3 py-1.5 rounded-full inline-block">
              Only {availableStock} left — order soon
            </p>
          )}

          {/* ── Social proof signals ── */}
          <div className="mt-4 flex flex-wrap gap-2">
            {viewerCount > 0 && (
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/60 border border-border/40 px-3 py-1.5 rounded-full">
                <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                {viewerCount} people viewing this now
              </span>
            )}
            {ordersToday > 0 && (
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/60 border border-border/40 px-3 py-1.5 rounded-full">
                🛍️ {ordersToday} ordered today
              </span>
            )}
          </div>

          {product.description && (
            <p className="mt-6 text-muted-foreground leading-relaxed font-light whitespace-pre-line text-sm">{product.description}</p>
          )}

          {/* Divider */}
          <div className="my-8 h-px bg-border/60" />

          {sizes.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <div className="text-[10px] tracking-[0.18em] uppercase text-muted-foreground">
                  Size — <span className="text-foreground">{selectedSize}</span>
                </div>
                <Dialog>
                  <DialogTrigger asChild>
                    <button type="button" className="flex items-center gap-1 text-[10px] tracking-[0.12em] uppercase text-muted-foreground hover:text-accent transition-colors">
                      <Ruler className="size-3" /> Size guide
                    </button>
                  </DialogTrigger>
                  <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle className="font-display font-light text-2xl">Size Guide</DialogTitle>
                    </DialogHeader>
                    <div className="mt-2 space-y-5 text-sm">
                      {/* How to measure */}
                      <div className="rounded-xl bg-muted/50 border border-border/50 p-4 space-y-3">
                        <p className="text-xs font-medium tracking-[0.12em] uppercase text-muted-foreground">How to measure</p>
                        <div className="grid grid-cols-1 gap-2.5">
                          {[
                            { label: "Chest", desc: "Measure around the fullest part of your chest, keeping the tape horizontal." },
                            { label: "Waist", desc: "Measure around your natural waistline — the narrowest part of your torso." },
                            { label: "Hip", desc: "Measure around the fullest part of your hips, about 20 cm below your waist." },
                            { label: "Length", desc: "Measured from the highest point of the shoulder to the hem." },
                          ].map(({ label, desc }) => (
                            <div key={label} className="flex gap-3">
                              <span className="shrink-0 mt-0.5 size-5 rounded-full bg-accent/10 text-accent text-[10px] font-bold grid place-items-center">{label[0]}</span>
                              <div>
                                <p className="text-xs font-medium text-foreground">{label}</p>
                                <p className="text-[11px] text-muted-foreground leading-relaxed">{desc}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Size chart */}
                      <div>
                        <p className="text-xs font-medium tracking-[0.12em] uppercase text-muted-foreground mb-3">Measurements (cm)</p>
                        <div className="rounded-xl border border-border overflow-hidden">
                          <table className="w-full text-center border-collapse text-xs">
                            <thead>
                              <tr className="bg-muted/60 border-b border-border">
                                {["Size","Chest","Waist","Hip","Length"].map((h) => (
                                  <th key={h} className={`py-2.5 px-2 font-medium text-foreground text-[10px] tracking-wider uppercase ${h === "Size" ? "text-left pl-3" : ""}`}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {[
                                { size: "XS", chest: "82–86", waist: "62–66", hip: "88–92",   length: "64" },
                                { size: "S",  chest: "86–90", waist: "66–70", hip: "92–96",   length: "65" },
                                { size: "M",  chest: "90–94", waist: "70–74", hip: "96–100",  length: "66" },
                                { size: "L",  chest: "94–98", waist: "74–78", hip: "100–104", length: "68" },
                                { size: "XL", chest: "98–104",waist: "78–84", hip: "104–110", length: "70" },
                                { size: "XXL",chest: "104–110",waist:"84–90", hip: "110–116", length: "72" },
                              ].map((r) => {
                                const isSelected = r.size === selectedSize;
                                return (
                                  <tr key={r.size} className={`border-b last:border-0 transition-colors ${isSelected ? "bg-accent/8 text-accent font-medium" : "hover:bg-muted/30"}`}>
                                    <td className={`py-2.5 px-2 pl-3 text-left font-semibold ${isSelected ? "text-accent" : "text-foreground"}`}>
                                      {r.size}{isSelected && <span className="ml-1.5 text-[9px] bg-accent text-accent-foreground px-1.5 py-0.5 rounded-full">Selected</span>}
                                    </td>
                                    <td className="py-2.5 px-2">{r.chest}</td>
                                    <td className="py-2.5 px-2">{r.waist}</td>
                                    <td className="py-2.5 px-2">{r.hip}</td>
                                    <td className="py-2.5 px-2">{r.length}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* AI Size Finder */}
                      {sizes.length > 0 && (
                        <div className="rounded-xl bg-accent/5 border border-accent/20 p-4 space-y-3">
                          <div className="flex items-center gap-2">
                            <Sparkles className="size-3.5 text-accent" />
                            <p className="text-xs font-medium tracking-[0.12em] uppercase text-accent">AI Size Finder</p>
                          </div>
                          <p className="text-[11px] text-muted-foreground">Enter your measurements and AI will recommend your size.</p>
                          <div className="grid grid-cols-3 gap-2">
                            {(["bust", "waist", "hips"] as const).map((field) => (
                              <div key={field}>
                                <label className="text-[10px] text-muted-foreground uppercase tracking-wider">{field} (cm)</label>
                                <input
                                  type="number"
                                  min={50} max={150}
                                  value={aiMeasurements[field]}
                                  onChange={(e) => setAiMeasurements((prev) => ({ ...prev, [field]: e.target.value }))}
                                  placeholder="e.g. 88"
                                  className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-accent transition-colors"
                                />
                              </div>
                            ))}
                          </div>
                          <button
                            type="button"
                            onClick={handleAISizeCheck}
                            disabled={aiSizeLoading}
                            className="w-full flex items-center justify-center gap-2 rounded-xl bg-accent text-accent-foreground text-xs font-medium py-2.5 hover:opacity-90 transition-opacity disabled:opacity-60"
                          >
                            {aiSizeLoading ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
                            {aiSizeLoading ? "Analysing…" : "Find my size"}
                          </button>
                          {aiSizeResult && (
                            <div className="rounded-lg bg-background border border-border p-3 space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-muted-foreground">Recommended size</span>
                                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${aiSizeResult.confidence === "high" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                                  {aiSizeResult.confidence} confidence
                                </span>
                              </div>
                              <p className="text-2xl font-display font-light text-accent">{aiSizeResult.size}</p>
                              <p className="text-[11px] text-muted-foreground">{aiSizeResult.reason}</p>
                              {sizes.find((s) => s.name === aiSizeResult.size) && (
                                <button
                                  type="button"
                                  onClick={() => { setSelectedSize(aiSizeResult.size); toast.success(`Size ${aiSizeResult.size} selected`); }}
                                  className="text-[11px] text-accent underline underline-offset-2 hover:opacity-80 transition-opacity"
                                >
                                  Select this size →
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Tips */}
                      <div className="flex flex-col gap-2 text-[11px] text-muted-foreground border-t border-border/50 pt-4">
                        <p>📏 <strong className="text-foreground">Between sizes?</strong> Size up for a more comfortable fit.</p>
                        <p>🤔 <strong className="text-foreground">Not sure?</strong> Message us on WhatsApp and we'll help you pick.</p>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
              <div className="flex flex-wrap gap-2">
                {sizes.map((s) => {
                  const sizeOut = s.stock_quantity === 0;
                  return (
                    <Tooltip key={s.id}>
                      <TooltipTrigger asChild>
                        <button type="button" onClick={() => !sizeOut && setSelectedSize(s.name)}
                          disabled={sizeOut}
                          className={`min-w-11 h-11 px-3 rounded-full border text-xs tracking-wider uppercase font-medium transition-all duration-200
                            ${selectedSize === s.name ? "border-accent bg-accent text-accent-foreground shadow-sm" : "border-border text-muted-foreground"}
                            ${sizeOut ? "opacity-25 cursor-not-allowed line-through" : "hover:border-accent/60 hover:text-foreground"}`}>
                          {s.name}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>{sizeOut ? `${s.name} — out of stock` : `Select ${s.name}`}</TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </div>
          )}

          {/* CTA buttons */}
            <div className="mt-8 flex flex-col gap-3">
              <Button size="lg" className="w-full rounded-full text-sm tracking-wide transition-all duration-300 hover:shadow-[0_8px_25px_oklch(0.62_0.14_358/0.35)] hover:scale-[1.01] btn-press" disabled={outOfStock}
                onClick={() => navigate({ to: "/checkout/$productId", params: { productId: product.id }, search: { color: "", size: selectedSize ?? "" } })}>
                {outOfStock ? "Sold out" : "Buy now — Cash on delivery"}
              </Button>
              <div className="flex gap-3">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="lg" variant="outline" className="flex-1 rounded-full text-sm tracking-wide hover:border-accent hover:text-accent transition-all duration-200" disabled={outOfStock}
                      onClick={() => {
                        addToCart({ productId: product.id, productName: product.name, image: product.image_url, color: null, size: selectedSize ?? null, unitPrice: price, weight: Number(product.weight) || 0.5 }, 1);
                        trackAddToCart({ id: product.id, name: product.name, price, quantity: 1 });
                        toast.success("Added to cart");
                      }}>
                      Add to cart
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Add to cart and keep shopping</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="lg" variant="outline"
                      className={`rounded-full px-4 transition-all duration-200 ${wishlisted ? "border-accent text-accent bg-accent/8" : "hover:border-accent hover:text-accent"}`}
                      onClick={() => {
                        const added = toggleWishlist({ id: product.id, name: product.name, price: product.price, sale_price: product.sale_price, on_sale: product.on_sale, image_url: product.image_url });
                        setWishlisted(added);
                        toast.success(added ? "Saved to wishlist" : "Removed from wishlist");
                      }}>
                      <Heart className={`size-4 ${wishlisted ? "fill-accent" : ""}`} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{wishlisted ? "Remove from wishlist" : "Save to wishlist"}</TooltipContent>
                </Tooltip>

                {waLink && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button asChild size="lg" variant="outline" className="rounded-full px-4 hover:border-accent hover:text-accent transition-all duration-200">
                        <a href={waLink} target="_blank" rel="noreferrer"><MessageCircle className="size-4" /></a>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Order via WhatsApp</TooltipContent>
                  </Tooltip>
                )}
              </div>
            </div>

            {/* Trust strip */}
            <div className="mt-8 grid grid-cols-2 gap-3">
              {[
                { icon: Truck, label: "Nationwide delivery", sub: "Pathao courier", tip: "We deliver across Nepal via Pathao courier. Estimated 2–4 days." },
                { icon: Package, label: "Cash on delivery", sub: "No card needed", tip: "Pay in cash when your order arrives — no online payment required." },
                { icon: RotateCcw, label: "Easy returns", sub: "Hassle-free", tip: "Not satisfied? Contact us within 7 days for a return or exchange." },
                { icon: ShieldCheck, label: "Authentic product", sub: "Quality guaranteed", tip: "Every item is quality-checked before dispatch." },
              ].map(({ icon: Icon, label, sub, tip }) => (
                <Tooltip key={label}>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-2.5 py-2.5 px-3 rounded-xl bg-muted/40 border border-border/40 cursor-default">
                      <Icon className="size-4 text-accent shrink-0" />
                      <div>
                        <p className="text-xs font-medium leading-none">{label}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-50 text-center text-xs">{tip}</TooltipContent>
                </Tooltip>
              ))}
            </div>

            {/* Social share */}
            <div className="mt-6 flex items-center gap-3 pt-6 border-t border-border/40">
              <span className="text-[10px] tracking-[0.15em] uppercase text-muted-foreground">Share</span>
              {(["whatsapp","facebook","copy","social"] as const).map((p, i) => (
                <Tooltip key={p}>
                  <TooltipTrigger asChild>
                    <button type="button" onClick={() => handleShare(p)}
                      className="size-8 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:border-accent hover:text-accent transition-all duration-200">
                      {i === 0 ? <MessageCircle className="size-3.5" /> : i === 1 ? <Facebook className="size-3.5" /> : i === 2 ? <Copy className="size-3.5" /> : <Sparkles className="size-3.5" />}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{p === "copy" ? "Copy link" : p === "social" ? "Copy link for Instagram/TikTok bio" : `Share on ${p}`}</TooltipContent>
                </Tooltip>
              ))}
            </div>
        </div>
        </TooltipProvider>
      </div>



      {/* Recently viewed */}
      {recentlyViewed.length > 0 && (
        <section className="border-t border-border/50 mt-12">
          <div className="container mx-auto px-6 py-16 pb-4">
            <p className="text-[10px] tracking-[0.2em] uppercase text-accent mb-2">Your history</p>
            <h2 className="text-3xl font-display font-light mb-10">Recently viewed</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-5 gap-y-10">
              {recentlyViewed.map((p) => (
                <Link key={p.id} to="/product/$slug" params={{ slug: slugify(p.name) }} className="group">
                  <div className="aspect-[3/4] overflow-hidden rounded-xl">
                    {p.image_url ? (
                      <LazyImageFill src={p.image_url} alt={p.name} className="object-cover group-hover:scale-105 transition-transform duration-500" />
                    ) : (
                      <div className="w-full h-full bg-[oklch(0.95_0.010_60)] grid place-items-center text-muted-foreground/40 text-xs">No image</div>
                    )}
                  </div>
                  <div className="mt-3 px-0.5">
                    <h3 className="text-sm font-light leading-snug group-hover:text-accent transition-colors">{p.name}</h3>
                    <div className="mt-1 text-xs text-muted-foreground tabular-nums">
                      {p.on_sale && p.sale_price ? (
                        <span><span className="line-through mr-1">NRS {p.price}</span><span className="text-accent font-medium">NRS {p.sale_price}</span></span>
                      ) : <span>NRS {p.price}</span>}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {sortedRelated.length > 0 && (
        <section className="border-t border-border/50">
          <div className="container mx-auto px-6 py-16">
            <div className="flex items-center gap-2 mb-2">
              <p className="text-[10px] tracking-[0.2em] uppercase text-accent">You may love</p>
              {aiRecommendedIds.length > 0 && (
                <span className="flex items-center gap-1 text-[9px] text-muted-foreground/60 tracking-wide uppercase">
                  <Sparkles className="size-2.5" /> AI picked
                </span>
              )}
            </div>
            <h2 className="text-3xl font-display font-light mb-10">Complete the look</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-5 gap-y-10">
              {sortedRelated.map((p) => (
                <Link key={p.id} to="/product/$slug" params={{ slug: slugify(p.name) }} className="group">
                  <div className="aspect-[3/4] overflow-hidden rounded-xl relative">
                    {p.image_url ? (
                      <LazyImageFill src={p.image_url} alt={p.name} className="object-cover group-hover:scale-[1.06] transition-transform duration-500" />
                    ) : (
                      <div className="w-full h-full bg-[oklch(0.95_0.010_60)] grid place-items-center text-muted-foreground/40 text-xs">No image</div>
                    )}
                    {p.stock_quantity === 0 && (
                      <span className="absolute top-3 left-3 bg-background/90 backdrop-blur text-muted-foreground text-[10px] font-medium px-2.5 py-1 rounded-full">Sold out</span>
                    )}
                  </div>
                  <div className="mt-3 px-0.5">
                    <h3 className="text-sm font-light leading-snug group-hover:text-accent transition-colors">{p.name}</h3>
                    <div className="mt-1 text-xs text-muted-foreground tabular-nums">
                      {p.on_sale && p.sale_price ? (
                        <span><span className="line-through mr-1">NRS {p.price}</span><span className="text-accent font-medium">NRS {p.sale_price}</span></span>
                      ) : <span>NRS {p.price}</span>}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}
      <AIChat productName={product.name} productCategory={product.category ?? undefined} openOnMount={typeof window !== "undefined" && new URLSearchParams(window.location.search).get("from") === "social"} />
      <SiteFooter />
    </div>
  );
}
