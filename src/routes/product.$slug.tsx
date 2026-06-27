import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { MessageCircle, Copy, Facebook, ZoomIn, Ruler, Heart, Truck, RotateCcw, ShieldCheck, Package } from "lucide-react";
import { slugify } from "@/lib/slugify";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCart } from "@/lib/cart";
import { toggleWishlist, isWishlisted } from "@/lib/wishlist";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

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
  component: ProductPage,
});

function useProductSEO(product: { name: string; description: string | null; price: number; sale_price: number | null; on_sale: boolean; image_url: string | null } | null) {
  useEffect(() => {
    if (!product) return;
    const price = product.on_sale && product.sale_price ? product.sale_price : product.price;
    const title = `${product.name} — NRS ${price}`;
    const desc = product.description
      ? product.description.slice(0, 155)
      : `Buy ${product.name} for NRS ${price}. Cash on delivery, nationwide.`;
    const image = product.image_url ?? "";

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
    if (image) set('meta[property="og:image"]', "content", image);
    set('meta[name="twitter:title"]', "content", title);
    set('meta[name="twitter:description"]', "content", desc);
    if (image) set('meta[name="twitter:image"]', "content", image);
  }, [product]);
}

type Product = {
  id: string; name: string; description: string | null; price: number;
  sale_price: number | null; on_sale: boolean; image_url: string | null;
  whatsapp_number: string | null; stock_quantity: number | null; category: string | null; weight: number;
};
type Color = { id: string; name: string; hex: string; stock_quantity: number | null };
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
  const [colors, setColors] = useState<Color[]>([]);
  const [sizes, setSizes] = useState<Size[]>([]);
  const [gallery, setGallery] = useState<string[]>([]);
  const [activeImage, setActiveImage] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [defaultWa, setDefaultWa] = useState("");
  const [related, setRelated] = useState<RelatedProduct[]>([]);
  const [recentlyViewed, setRecentlyViewed] = useState<RVItem[]>([]);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [zoomPos, setZoomPos] = useState({ x: 50, y: 50 });
  const [wishlisted, setWishlisted] = useState(false);
  const imgRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Fetch product + whatsapp setting in parallel, then batch variant queries
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
        supabase.from("product_colors").select("*").eq("product_id", id),
        supabase.from("product_sizes").select("*").eq("product_id", id).order("position"),
        supabase.from("product_images").select("image_url").eq("product_id", id).order("position"),
      ]).then(([{ data: cd }, { data: sd }, { data: gd }]) => {
        const colorList = (cd as Color[]) ?? [];
        setColors(colorList);
        setSelected((colorList.find((c) => c.stock_quantity !== 0) ?? colorList[0])?.name ?? null);
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
  }, [product?.id]);

  useEffect(() => {
    if (!product) return;
    supabase.from("products")
      .select("id,name,price,sale_price,on_sale,image_url,stock_quantity,category")
      .eq("active", true).neq("id", product.id).limit(20)
      .then(({ data }) => {
        const list = (data as RelatedProduct[]) ?? [];
        // Same-category products feel more "you may also like" than a
        // grab bag, but if there aren't enough, fill the rest from
        // whatever else is in stock so the section isn't sparse.
        const sameCategory = list.filter((p) => p.category && p.category === product.category);
        const rest = list.filter((p) => !(p.category && p.category === product.category));
        setRelated([...sameCategory, ...rest].slice(0, 4));
      });
  }, [product?.id, product?.category]);

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
  const colorLimit = colors.length > 0 ? (colors.find((c) => c.name === selected)?.stock_quantity ?? null) : null;
  const sizeLimit = sizes.length > 0 ? (sizes.find((s) => s.name === selectedSize)?.stock_quantity ?? null) : null;
  const trackedLimits = [colorLimit, sizeLimit].filter((v): v is number => v !== null);
  const availableStock = colors.length === 0 && sizes.length === 0 ? product.stock_quantity : trackedLimits.length > 0 ? Math.min(...trackedLimits) : null;
  const outOfStock = availableStock === 0;
  const lowStock = availableStock !== null && availableStock > 0 && availableStock <= 5;
  const waNumber = (product.whatsapp_number || defaultWa).replace(/\D/g, "");
  const variantLabel = [selected, selectedSize].filter(Boolean).join(", ");
  const waMessage = `Hi! I want to order: ${product.name}${variantLabel ? ` (${variantLabel})` : ""} — NRS ${price}`;
  const waLink = !outOfStock && waNumber ? `https://wa.me/${waNumber}?text=${encodeURIComponent(waMessage)}` : null;
  const shareUrl = typeof window !== "undefined" ? window.location.href : "";
  const shareText = `Check out ${product.name} — NRS ${price}`;

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setZoomPos({
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    });
  };

  const handleShare = async (platform: "whatsapp" | "facebook" | "copy") => {
    if (platform === "whatsapp") {
      window.open(`https://wa.me/?text=${encodeURIComponent(`${shareText} ${shareUrl}`)}`, "_blank");
    } else if (platform === "facebook") {
      window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`, "_blank");
    } else {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Link copied!");
    }
  };

  return (
    <div className="min-h-screen flex flex-col pb-24 sm:pb-0 page-enter">
      <SiteNav />

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
            <div className="flex gap-2 mt-4">
              {images.map((url, i) => (
                <button key={i} type="button" onClick={() => setActiveImage(i)}
                  className={`size-16 rounded-lg overflow-hidden border-2 shrink-0 transition-all duration-200 ${i === activeImage ? "border-accent shadow-sm" : "border-transparent opacity-60 hover:opacity-100"}`}>
                  <img src={url} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Product info ── */}
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

          {outOfStock && <p className="mt-3 text-sm font-medium text-destructive tracking-wide">Sold out</p>}
          {!outOfStock && lowStock && (
            <p className="mt-3 text-xs tracking-wide text-amber-600 bg-amber-50 border border-amber-100 px-3 py-1.5 rounded-full inline-block">
              Only {availableStock} left — order soon
            </p>
          )}

          {product.description && (
            <p className="mt-6 text-muted-foreground leading-relaxed font-light whitespace-pre-line text-sm">{product.description}</p>
          )}

          {/* Divider */}
          <div className="my-8 h-px bg-border/60" />

          {colors.length > 0 && (
            <div className="mb-6">
              <div className="text-[10px] tracking-[0.18em] uppercase text-muted-foreground mb-3">
                Colour — <span className="text-foreground">{selected}</span>
              </div>
              <div className="flex flex-wrap gap-2.5">
                {colors.map((c) => {
                  const colorOut = c.stock_quantity === 0;
                  return (
                    <button key={c.id} type="button" onClick={() => !colorOut && setSelected(c.name)}
                      title={colorOut ? `${c.name} — out of stock` : c.name}
                      disabled={colorOut}
                      className={`relative size-8 rounded-full border-2 transition-all duration-200 ${selected === c.name ? "border-accent scale-110 ring-2 ring-accent/25" : "border-border hover:scale-110"} ${colorOut ? "opacity-25 cursor-not-allowed" : ""}`}
                      style={{ background: c.hex }}>
                      {colorOut && <span className="absolute inset-0 flex items-center justify-center text-[10px] text-white/90">✕</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

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
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle className="font-display font-light text-2xl">Size Guide</DialogTitle>
                    </DialogHeader>
                    <div className="mt-3 text-sm text-muted-foreground">
                      <p className="mb-4 text-xs leading-relaxed">Measure yourself and compare with the chart below. All measurements are in cm.</p>
                      <table className="w-full text-center border-collapse text-xs">
                        <thead>
                          <tr className="border-b">
                            {["Size","Chest","Waist","Hip","Length"].map((h) => (
                              <th key={h} className={`py-2 px-2 font-medium text-foreground text-[10px] tracking-wider uppercase ${h === "Size" ? "text-left" : ""}`}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {[
                            { size: "XS", chest: "82–86", waist: "62–66", hip: "88–92", length: "64" },
                            { size: "S",  chest: "86–90", waist: "66–70", hip: "92–96", length: "65" },
                            { size: "M",  chest: "90–94", waist: "70–74", hip: "96–100", length: "66" },
                            { size: "L",  chest: "94–98", waist: "74–78", hip: "100–104", length: "68" },
                            { size: "XL", chest: "98–104", waist: "78–84", hip: "104–110", length: "70" },
                            { size: "XXL",chest: "104–110",waist: "84–90", hip: "110–116", length: "72" },
                          ].map((r) => (
                            <tr key={r.size} className="border-b last:border-0 hover:bg-muted/40 transition-colors">
                              <td className="py-2 px-2 text-left font-medium text-foreground">{r.size}</td>
                              <td className="py-2 px-2">{r.chest}</td>
                              <td className="py-2 px-2">{r.waist}</td>
                              <td className="py-2 px-2">{r.hip}</td>
                              <td className="py-2 px-2">{r.length}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p className="mt-4 text-xs text-muted-foreground/70">If you're between sizes, we recommend sizing up.</p>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
              <div className="flex flex-wrap gap-2">
                {sizes.map((s) => {
                  const sizeOut = s.stock_quantity === 0;
                  return (
                    <button key={s.id} type="button" onClick={() => !sizeOut && setSelectedSize(s.name)}
                      disabled={sizeOut}
                      className={`min-w-12 h-10 px-3 rounded-full border text-xs tracking-wider uppercase font-medium transition-all duration-200
                        ${selectedSize === s.name ? "border-accent bg-accent text-accent-foreground shadow-sm" : "border-border text-muted-foreground"}
                        ${sizeOut ? "opacity-25 cursor-not-allowed line-through" : "hover:border-accent/60 hover:text-foreground"}`}>
                      {s.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* CTA buttons — hidden on mobile (sticky bar handles it) */}
          <TooltipProvider delayDuration={400}>
            <div className="mt-8 hidden sm:flex flex-col gap-3">
              <Button size="lg" className="w-full rounded-full text-sm tracking-wide transition-all duration-300 hover:shadow-[0_8px_25px_oklch(0.62_0.14_358/0.35)] hover:scale-[1.01] btn-press" disabled={outOfStock}
                onClick={() => navigate({ to: "/checkout/$productId", params: { productId: product.id }, search: { color: selected ?? "", size: selectedSize ?? "" } })}>
                {outOfStock ? "Sold out" : "Buy now — Cash on delivery"}
              </Button>
              <div className="flex gap-3">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="lg" variant="outline" className="flex-1 rounded-full text-sm tracking-wide hover:border-accent hover:text-accent transition-all duration-200" disabled={outOfStock}
                      onClick={() => {
                        addToCart({ productId: product.id, productName: product.name, image: product.image_url, color: selected ?? null, size: selectedSize ?? null, unitPrice: price, weight: Number(product.weight) || 0.5 }, 1);
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
            <div className="mt-8 hidden sm:grid grid-cols-2 gap-3">
              {[
                { icon: Truck, label: "Nationwide delivery", sub: "Pathao courier" },
                { icon: Package, label: "Cash on delivery", sub: "No card needed" },
                { icon: RotateCcw, label: "Easy returns", sub: "Hassle-free" },
                { icon: ShieldCheck, label: "Authentic product", sub: "Quality guaranteed" },
              ].map(({ icon: Icon, label, sub }) => (
                <div key={label} className="flex items-center gap-2.5 py-2.5 px-3 rounded-xl bg-muted/40 border border-border/40">
                  <Icon className="size-4 text-accent shrink-0" />
                  <div>
                    <p className="text-xs font-medium leading-none">{label}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Social share */}
            <div className="mt-6 flex items-center gap-3 pt-6 border-t border-border/40">
              <span className="text-[10px] tracking-[0.15em] uppercase text-muted-foreground">Share</span>
              {(["whatsapp","facebook","copy"] as const).map((p, i) => (
                <Tooltip key={p}>
                  <TooltipTrigger asChild>
                    <button type="button" onClick={() => handleShare(p)}
                      className="size-8 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:border-accent hover:text-accent transition-all duration-200">
                      {i === 0 ? <MessageCircle className="size-3.5" /> : i === 1 ? <Facebook className="size-3.5" /> : <Copy className="size-3.5" />}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{p === "copy" ? "Copy link" : `Share on ${p}`}</TooltipContent>
                </Tooltip>
              ))}
            </div>
          </TooltipProvider>
        </div>
      </div>

      {/* ── Sticky mobile CTA ── */}
      <div className="sm:hidden fixed bottom-0 inset-x-0 z-50 bg-background/95 backdrop-blur-md border-t border-border/60 p-3 flex gap-2">
        <Button size="lg" className="flex-1 rounded-full text-sm" disabled={outOfStock}
          onClick={() => navigate({ to: "/checkout/$productId", params: { productId: product.id }, search: { color: selected ?? "", size: selectedSize ?? "" } })}>
          {outOfStock ? "Sold out" : "Buy now"}
        </Button>
        <Button size="lg" variant="outline" className="rounded-full px-4" disabled={outOfStock}
          onClick={() => {
            addToCart({ productId: product.id, productName: product.name, image: product.image_url, color: selected ?? null, size: selectedSize ?? null, unitPrice: price, weight: Number(product.weight) || 0.5 }, 1);
            toast.success("Added to cart");
          }}>
          + Cart
        </Button>
        {waLink && (
          <Button asChild size="lg" variant="outline" className="rounded-full px-4">
            <a href={waLink} target="_blank" rel="noreferrer"><MessageCircle className="size-4" /></a>
          </Button>
        )}
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
                  <div className="aspect-[3/4] bg-[oklch(0.95_0.010_60)] overflow-hidden rounded-xl">
                    {p.image_url ? (
                      <img src={p.image_url} alt={p.name} loading="lazy" decoding="async" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    ) : (
                      <div className="w-full h-full grid place-items-center text-muted-foreground/40 text-xs">No image</div>
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

      {related.length > 0 && (
        <section className="border-t border-border/50">
          <div className="container mx-auto px-6 py-16">
            <p className="text-[10px] tracking-[0.2em] uppercase text-accent mb-2">You may love</p>
            <h2 className="text-3xl font-display font-light mb-10">Complete the look</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-5 gap-y-10">
              {related.map((p) => (
                <Link key={p.id} to="/product/$slug" params={{ slug: slugify(p.name) }} className="group">
                  <div className="aspect-[3/4] bg-[oklch(0.95_0.010_60)] overflow-hidden rounded-xl relative">
                    {p.image_url ? (
                      <img src={p.image_url} alt={p.name} loading="lazy" decoding="async" className="w-full h-full object-cover group-hover:scale-[1.06] transition-transform duration-600" />
                    ) : (
                      <div className="w-full h-full grid place-items-center text-muted-foreground/40 text-xs">No image</div>
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
      <SiteFooter />
    </div>
  );
}
