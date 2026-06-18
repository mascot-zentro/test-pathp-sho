import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/product/$id")({
  component: ProductPage,
});

type Product = {
  id: string; name: string; description: string | null; price: number;
  sale_price: number | null; on_sale: boolean; image_url: string | null;
  whatsapp_number: string | null; stock_quantity: number | null; category: string | null;
};
type Color = { id: string; name: string; hex: string; stock_quantity: number | null };
type Size = { id: string; name: string; stock_quantity: number | null };
type RelatedProduct = {
  id: string; name: string; price: number; sale_price: number | null;
  on_sale: boolean; image_url: string | null; stock_quantity: number | null; category: string | null;
};

function ProductPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [product, setProduct] = useState<Product | null>(null);
  const [colors, setColors] = useState<Color[]>([]);
  const [sizes, setSizes] = useState<Size[]>([]);
  const [gallery, setGallery] = useState<string[]>([]);
  const [activeImage, setActiveImage] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [defaultWa, setDefaultWa] = useState("");
  const [related, setRelated] = useState<RelatedProduct[]>([]);

  useEffect(() => {
    supabase.from("products").select("*").eq("id", id).maybeSingle().then(({ data }) => setProduct(data as Product | null));
    supabase.from("product_colors").select("*").eq("product_id", id).then(({ data }) => {
      const list = (data as Color[]) ?? [];
      setColors(list);
      const firstInStock = list.find((c) => c.stock_quantity !== 0);
      setSelected((firstInStock ?? list[0])?.name ?? null);
    });
    supabase.from("product_sizes").select("*").eq("product_id", id).order("position").then(({ data }) => {
      const list = (data as Size[]) ?? [];
      setSizes(list);
      const firstInStock = list.find((s) => s.stock_quantity !== 0);
      setSelectedSize((firstInStock ?? list[0])?.name ?? null);
    });
    supabase.from("product_images").select("image_url").eq("product_id", id).order("position").then(({ data }) => {
      setGallery((data ?? []).map((r: { image_url: string }) => r.image_url));
      setActiveImage(0);
    });
    supabase.from("app_settings").select("value").eq("key", "whatsapp_number").maybeSingle()
      .then(({ data }) => setDefaultWa(data?.value ?? ""));
  }, [id]);

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

  if (!product) return <div className="min-h-screen"><SiteNav /><div className="container mx-auto px-6 py-20 text-muted-foreground">Loading…</div></div>;

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

  return (
    <div className="min-h-screen flex flex-col">
      <SiteNav />
      <div className="container mx-auto px-6 py-10 grid md:grid-cols-2 gap-10 flex-1">
        <div>
          <div className="aspect-[4/5] bg-muted rounded-md overflow-hidden">
            {images[activeImage] && <img src={images[activeImage]} alt={product.name} className="w-full h-full object-cover" />}
          </div>
          {images.length > 1 && (
            <div className="flex gap-2 mt-3">
              {images.map((url, i) => (
                <button key={i} type="button" onClick={() => setActiveImage(i)}
                  className={`size-16 rounded-md overflow-hidden border-2 shrink-0 ${i === activeImage ? "border-accent" : "border-transparent"}`}>
                  <img src={url} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
        <div>
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">← Back to shop</Link>
          <h1 className="text-3xl md:text-4xl font-display mt-4">{product.name}</h1>
          <div className="mt-3 text-xl tabular-nums">
            {product.on_sale && product.sale_price ? (
              <><span className="text-muted-foreground line-through mr-2">NRS {product.price}</span><span className="text-accent">NRS {product.sale_price}</span></>
            ) : (
              <>NRS {product.price}</>
            )}
          </div>
          {outOfStock && <p className="mt-2 text-sm font-medium text-destructive">Out of stock</p>}
          {!outOfStock && lowStock && <p className="mt-2 text-sm text-amber-600">Only {availableStock} left in stock</p>}
          {product.description && <p className="mt-6 text-muted-foreground leading-relaxed whitespace-pre-line">{product.description}</p>}

          {colors.length > 0 && (
            <div className="mt-8">
              <div className="text-sm font-medium mb-3">Color: <span className="text-muted-foreground">{selected}</span></div>
              <div className="flex flex-wrap gap-2">
                {colors.map((c) => {
                  const colorOut = c.stock_quantity === 0;
                  return (
                    <button key={c.id} type="button" onClick={() => !colorOut && setSelected(c.name)} title={colorOut ? `${c.name} — out of stock` : c.name}
                      disabled={colorOut}
                      className={`relative size-9 rounded-full border-2 transition ${selected === c.name ? "border-accent ring-2 ring-accent/30" : "border-border"} ${colorOut ? "opacity-30 cursor-not-allowed" : ""}`}
                      style={{ background: c.hex }}>
                      {colorOut && <span className="absolute inset-0 flex items-center justify-center text-[10px] text-white/90">✕</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {sizes.length > 0 && (
            <div className="mt-6">
              <div className="text-sm font-medium mb-3">Size: <span className="text-muted-foreground">{selectedSize}</span></div>
              <div className="flex flex-wrap gap-2">
                {sizes.map((s) => {
                  const sizeOut = s.stock_quantity === 0;
                  return (
                    <button key={s.id} type="button" onClick={() => !sizeOut && setSelectedSize(s.name)}
                      disabled={sizeOut}
                      className={`min-w-11 h-11 px-3 rounded-md border-2 text-sm font-medium transition ${selectedSize === s.name ? "border-accent bg-accent/10" : "border-border"} ${sizeOut ? "opacity-30 cursor-not-allowed line-through" : "hover:border-accent/60"}`}>
                      {s.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="mt-10 flex flex-col sm:flex-row gap-3">
            <Button size="lg" className="flex-1" disabled={outOfStock}
              onClick={() => navigate({ to: "/checkout/$productId", params: { productId: product.id }, search: { color: selected ?? "", size: selectedSize ?? "" } })}>
              {outOfStock ? "Out of stock" : "Buy now — Cash on delivery"}
            </Button>
            {waLink && (
              <Button asChild size="lg" variant="outline" className="flex-1">
                <a href={waLink} target="_blank" rel="noreferrer"><MessageCircle className="size-4 mr-2" /> Order on WhatsApp</a>
              </Button>
            )}
          </div>
          {!outOfStock && !waLink && <p className="text-xs text-muted-foreground mt-2">WhatsApp ordering unavailable — admin hasn't set a number.</p>}
        </div>
      </div>
      {related.length > 0 && (
        <section className="border-t">
          <div className="container mx-auto px-6 py-16">
            <h2 className="text-xl font-display mb-8">You may also like</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-10">
              {related.map((p) => (
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
                  <div className="mt-3 flex items-start justify-between gap-2">
                    <h3 className="text-sm font-medium leading-tight">{p.name}</h3>
                    <div className="text-sm tabular-nums whitespace-nowrap">
                      {p.on_sale && p.sale_price ? (
                        <span><span className="text-muted-foreground line-through mr-1">NRS {p.price}</span><span className="text-accent">NRS {p.sale_price}</span></span>
                      ) : (
                        <span>NRS {p.price}</span>
                      )}
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
