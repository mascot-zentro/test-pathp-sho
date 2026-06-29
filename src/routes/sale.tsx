import { createFileRoute, Link } from "@tanstack/react-router";
import { proxyUrl } from "@/lib/img-proxy";
import { slugify } from "@/lib/slugify";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";

export const Route = createFileRoute("/sale")({
  head: () => ({
    meta: [
      { title: "Sale — Modern Store" },
      { name: "description", content: "Limited-time discounts on selected items." },
    ],
  }),
  component: SalePage,
});

const PAGE_SIZE = 12;

type Product = { id: string; name: string; price: number; sale_price: number | null; image_url: string | null; stock_quantity: number | null };

function SalePage() {
  const [items, setItems] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchPage = async (from: number, append = false) => {
    const { data, count } = await supabase
      .from("products")
      .select("id,name,price,sale_price,image_url,stock_quantity", { count: "exact" })
      .eq("active", true)
      .eq("on_sale", true)
      .range(from, from + PAGE_SIZE - 1);
    const list = (data as Product[]) ?? [];
    setItems((prev) => append ? [...prev, ...list] : list);
    if (count !== null) setTotal(count);
  };

  useEffect(() => {
    setLoading(true);
    fetchPage(0).finally(() => setLoading(false)); // eslint-disable-line react-hooks/exhaustive-deps
  }, []);

  const handleLoadMore = async () => {
    setLoadingMore(true);
    await fetchPage(items.length, true);
    setLoadingMore(false);
  };

  const hasMore = items.length < total;

  return (
    <div className="min-h-screen flex flex-col">
      <SiteNav />

      {/* Hero */}
      <section className="border-b bg-muted/30">
        <div className="container mx-auto px-6 py-14 md:py-20 max-w-3xl">
          <p className="text-[10px] tracking-[0.25em] uppercase text-accent mb-3">Limited time</p>
          <h1 className="text-4xl md:text-5xl font-display font-light mb-3">Sale</h1>
          <p className="text-muted-foreground text-sm max-w-sm">
            Selected pieces at reduced prices. While stocks last.
          </p>
        </div>
      </section>

      <section className="container mx-auto px-6 py-12 flex-1">
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 md:gap-x-6 gap-y-12">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i}>
                <div className="aspect-4/5 rounded-xl bg-muted animate-pulse" />
                <div className="mt-3 h-3 bg-muted animate-pulse rounded w-3/4" />
                <div className="mt-2 h-3 bg-muted animate-pulse rounded w-1/3" />
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="py-24 text-center">
            <p className="text-muted-foreground">No sale items right now — check back soon.</p>
          </div>
        ) : (
          <>
            <p className="text-xs text-muted-foreground mb-8">{total} item{total === 1 ? "" : "s"} on sale</p>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 md:gap-x-6 gap-y-12">
              {items.map((p) => (
                <Link key={p.id} to="/product/$slug" params={{ slug: slugify(p.name) }} className="group">
                  <div className="aspect-4/5 bg-muted overflow-hidden rounded-xl relative">
                    {p.image_url && (
                      <img
                        src={proxyUrl(p.image_url)}
                        alt={p.name}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    )}
                    {p.stock_quantity === 0 ? (
                      <span className="absolute top-2 left-2 bg-background/90 text-destructive text-xs font-medium px-2 py-1 rounded-full">Out of stock</span>
                    ) : p.sale_price ? (
                      <span className="absolute top-2 left-2 bg-accent text-accent-foreground text-[10px] font-medium px-2.5 py-1 rounded-full">
                        −{Math.round((1 - p.sale_price / p.price) * 100)}%
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-3">
                    <h3 className="text-sm font-medium leading-snug line-clamp-2">{p.name}</h3>
                    <div className="text-sm tabular-nums mt-1 flex items-center gap-1.5 flex-wrap">
                      {p.sale_price ? (
                        <>
                          <span className="text-muted-foreground line-through text-xs">NRS {p.price}</span>
                          <span className="text-accent font-medium">NRS {p.sale_price}</span>
                        </>
                      ) : (
                        <span className="font-medium">NRS {p.price}</span>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            {/* Load more */}
            {hasMore && (
              <div className="flex justify-center mt-14">
                <button
                  type="button"
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="inline-flex items-center gap-2 px-8 py-3 rounded-full border border-foreground/20 text-sm font-medium tracking-wide transition-all duration-200 hover:border-accent hover:text-accent disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loadingMore ? (
                    <>
                      <span className="size-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
                      Loading…
                    </>
                  ) : (
                    <>Load more · {total - items.length} remaining</>
                  )}
                </button>
              </div>
            )}
            {!hasMore && items.length > PAGE_SIZE && (
              <p className="text-center text-xs text-muted-foreground mt-12 tracking-wide">
                All {total} sale item{total === 1 ? "" : "s"} shown.
              </p>
            )}
          </>
        )}
      </section>

      <SiteFooter />
    </div>
  );
}
