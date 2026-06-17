import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SiteNav } from "@/components/site-nav";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/product/$id")({
  component: ProductPage,
});

type Product = {
  id: string; name: string; description: string | null; price: number;
  sale_price: number | null; on_sale: boolean; image_url: string | null;
  whatsapp_number: string | null;
};
type Color = { id: string; name: string; hex: string };

function ProductPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [product, setProduct] = useState<Product | null>(null);
  const [colors, setColors] = useState<Color[]>([]);
  const [gallery, setGallery] = useState<string[]>([]);
  const [activeImage, setActiveImage] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [defaultWa, setDefaultWa] = useState("");

  useEffect(() => {
    supabase.from("products").select("*").eq("id", id).maybeSingle().then(({ data }) => setProduct(data as Product | null));
    supabase.from("product_colors").select("*").eq("product_id", id).then(({ data }) => {
      const list = (data as Color[]) ?? [];
      setColors(list);
      if (list[0]) setSelected(list[0].name);
    });
    supabase.from("product_images").select("image_url").eq("product_id", id).order("position").then(({ data }) => {
      setGallery((data ?? []).map((r: { image_url: string }) => r.image_url));
      setActiveImage(0);
    });
    supabase.from("app_settings").select("value").eq("key", "whatsapp_number").maybeSingle()
      .then(({ data }) => setDefaultWa(data?.value ?? ""));
  }, [id]);

  if (!product) return <div className="min-h-screen"><SiteNav /><div className="container mx-auto px-6 py-20 text-muted-foreground">Loading…</div></div>;

  const images = gallery.length > 0 ? gallery : product.image_url ? [product.image_url] : [];
  const price = product.on_sale && product.sale_price ? product.sale_price : product.price;
  const waNumber = (product.whatsapp_number || defaultWa).replace(/\D/g, "");
  const waMessage = `Hi! I want to order: ${product.name}${selected ? ` (color: ${selected})` : ""} — ৳${price}`;
  const waLink = waNumber ? `https://wa.me/${waNumber}?text=${encodeURIComponent(waMessage)}` : null;

  return (
    <div className="min-h-screen">
      <SiteNav />
      <div className="container mx-auto px-6 py-10 grid md:grid-cols-2 gap-10">
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
              <><span className="text-muted-foreground line-through mr-2">৳{product.price}</span><span className="text-accent">৳{product.sale_price}</span></>
            ) : (
              <>৳{product.price}</>
            )}
          </div>
          {product.description && <p className="mt-6 text-muted-foreground leading-relaxed whitespace-pre-line">{product.description}</p>}

          {colors.length > 0 && (
            <div className="mt-8">
              <div className="text-sm font-medium mb-3">Color: <span className="text-muted-foreground">{selected}</span></div>
              <div className="flex flex-wrap gap-2">
                {colors.map((c) => (
                  <button key={c.id} onClick={() => setSelected(c.name)} title={c.name}
                    className={`size-9 rounded-full border-2 transition ${selected === c.name ? "border-accent ring-2 ring-accent/30" : "border-border"}`}
                    style={{ background: c.hex }} />
                ))}
              </div>
            </div>
          )}

          <div className="mt-10 flex flex-col sm:flex-row gap-3">
            <Button size="lg" className="flex-1"
              onClick={() => navigate({ to: "/checkout/$productId", params: { productId: product.id }, search: { color: selected ?? "" } })}>
              Buy now — Cash on delivery
            </Button>
            {waLink && (
              <Button asChild size="lg" variant="outline" className="flex-1">
                <a href={waLink} target="_blank" rel="noreferrer"><MessageCircle className="size-4 mr-2" /> Order on WhatsApp</a>
              </Button>
            )}
          </div>
          {!waLink && <p className="text-xs text-muted-foreground mt-2">WhatsApp ordering unavailable — admin hasn't set a number.</p>}
        </div>
      </div>
    </div>
  );
}
