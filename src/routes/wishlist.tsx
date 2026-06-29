import { createFileRoute, Link } from "@tanstack/react-router";
import { proxyUrl } from "@/lib/img-proxy";
import { useEffect, useState } from "react";
import { Heart, ShoppingBag, Trash2, ArrowRight } from "lucide-react";
import { slugify } from "@/lib/slugify";
import { getWishlist, removeFromWishlist, type WishlistItem } from "@/lib/wishlist";
import { useCart } from "@/lib/cart";
import { toast } from "sonner";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/wishlist")({
  component: WishlistPage,
});

function WishlistPage() {
  const [items, setItems] = useState<WishlistItem[]>([]);
  const { addItem } = useCart();

  useEffect(() => {
    setItems(getWishlist());
  }, []);

  const remove = (id: string) => {
    removeFromWishlist(id);
    setItems((prev) => prev.filter((i) => i.id !== id));
    toast.success("Removed from wishlist");
  };

  const addToCart = (item: WishlistItem) => {
    const price = item.on_sale && item.sale_price ? item.sale_price : item.price;
    addItem(
      { productId: item.id, productName: item.name, image: item.image_url, color: null, size: null, unitPrice: price, weight: 0.5 },
      1,
    );
    toast.success("Added to cart");
  };

  return (
    <div className="min-h-screen flex flex-col bg-background page-enter">
      <SiteNav />

      <main className="flex-1 container mx-auto px-6 py-16 max-w-5xl">
        {/* Header */}
        <div className="mb-12">
          <p className="text-xs tracking-[0.2em] uppercase text-accent mb-2">Your list</p>
          <h1 className="text-4xl font-display font-light">Wishlist</h1>
          {items.length > 0 && (
            <p className="text-sm text-muted-foreground mt-2">
              {items.length} saved {items.length === 1 ? "piece" : "pieces"}
            </p>
          )}
        </div>

        {items.length === 0 ? (
          <div className="py-24 flex flex-col items-center text-center gap-6">
            <div className="size-20 rounded-full bg-accent/8 grid place-items-center">
              <Heart className="size-9 text-accent/40" />
            </div>
            <div>
              <p className="font-display text-2xl font-light mb-2">Your wishlist is empty</p>
              <p className="text-sm text-muted-foreground max-w-xs">
                Save pieces you love while you browse — they'll be waiting for you here.
              </p>
            </div>
            <Button asChild className="rounded-full px-8 mt-2">
              <Link to="/">
                Explore the collection <ArrowRight className="size-4 ml-1" />
              </Link>
            </Button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-5 gap-y-10">
              {items.map((item) => {
                const displayPrice = item.on_sale && item.sale_price ? item.sale_price : item.price;
                return (
                  <div key={item.id} className="group relative">
                    <Link to="/product/$slug" params={{ slug: slugify(item.name) }} className="block">
                      <div className="aspect-[3/4] bg-[oklch(0.95_0.010_60)] rounded-xl overflow-hidden relative">
                        {item.image_url ? (
                          <img
                            src={proxyUrl(item.image_url)}
                            alt={item.name}
                            loading="lazy"
                            decoding="async"
                            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.05]"
                          />
                        ) : (
                          <div className="w-full h-full grid place-items-center text-muted-foreground/30 text-xs">No image</div>
                        )}
                        {item.on_sale && item.sale_price && (
                          <span className="absolute top-3 left-3 bg-accent text-accent-foreground text-[10px] font-medium px-2.5 py-1 rounded-full">
                            Sale
                          </span>
                        )}
                      </div>
                    </Link>

                    {/* Remove button */}
                    <button
                      type="button"
                      onClick={() => remove(item.id)}
                      className="absolute top-3 right-3 size-8 rounded-full bg-background/80 backdrop-blur grid place-items-center text-muted-foreground hover:text-destructive hover:bg-background transition-all sm:opacity-0 sm:group-hover:opacity-100"
                      title="Remove from wishlist"
                    >
                      <Trash2 className="size-3.5" />
                    </button>

                    <div className="mt-3 px-0.5">
                      <Link to="/product/$slug" params={{ slug: slugify(item.name) }}>
                        <h3 className="text-sm font-light leading-snug group-hover:text-accent transition-colors">{item.name}</h3>
                      </Link>
                      <div className="mt-1 text-xs text-muted-foreground tabular-nums">
                        {item.on_sale && item.sale_price ? (
                          <span className="flex items-center gap-1.5">
                            <span className="line-through">NRS {item.price}</span>
                            <span className="text-accent font-medium">NRS {item.sale_price}</span>
                          </span>
                        ) : (
                          <span>NRS {displayPrice}</span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => addToCart(item)}
                        className="mt-3 w-full flex items-center justify-center gap-1.5 py-2 rounded-full border border-border text-xs font-medium tracking-wide text-muted-foreground hover:border-accent hover:text-accent transition-all duration-200 sm:opacity-0 sm:group-hover:opacity-100 sm:translate-y-1 sm:group-hover:translate-y-0"
                      >
                        <ShoppingBag className="size-3.5" />
                        Add to cart
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-16 pt-8 border-t border-border/50 flex flex-wrap items-center justify-between gap-4">
              <p className="text-sm text-muted-foreground">
                Your wishlist is saved on this device.
              </p>
              <Button asChild variant="outline" className="rounded-full">
                <Link to="/">Continue shopping <ArrowRight className="size-4 ml-1" /></Link>
              </Button>
            </div>
          </>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
