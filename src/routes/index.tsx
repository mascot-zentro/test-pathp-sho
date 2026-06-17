import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SiteNav } from "@/components/site-nav";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Modern Store — Shop the collection" },
      { name: "description", content: "Curated essentials, delivered nationwide." },
    ],
  }),
  component: Index,
});

type Product = { id: string; name: string; price: number; sale_price: number | null; on_sale: boolean; image_url: string | null };

function Index() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from("products").select("id,name,price,sale_price,on_sale,image_url").eq("active", true).order("created_at", { ascending: false })
      .then(({ data }) => { setProducts((data as Product[]) ?? []); setLoading(false); });
  }, []);

  return (
    <div className="min-h-screen">
      <SiteNav />
      <section className="container mx-auto px-6 py-20 md:py-28 text-center">
        <h1 className="text-5xl md:text-7xl font-display tracking-tight max-w-3xl mx-auto">Considered objects for everyday life.</h1>
        <p className="mt-6 text-muted-foreground max-w-xl mx-auto">A small collection, refreshed seasonally. Cash on delivery available across the country.</p>
      </section>
      <section className="container mx-auto px-6 pb-24">
        <div className="flex items-end justify-between mb-8">
          <h2 className="text-2xl font-display">Shop</h2>
          <Link to="/sale" className="text-sm text-accent hover:underline">View sale →</Link>
        </div>
        {loading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : products.length === 0 ? (
          <p className="text-muted-foreground">No products yet. Admins can add products from the admin panel.</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-12">
            {products.map((p) => (
              <Link key={p.id} to="/product/$id" params={{ id: p.id }} className="group">
                <div className="aspect-[4/5] bg-muted overflow-hidden rounded-md">
                  {p.image_url ? (
                    <img src={p.image_url} alt={p.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  ) : (
                    <div className="w-full h-full grid place-items-center text-muted-foreground text-xs">No image</div>
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
      <footer className="border-t py-10 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} Modern Store
      </footer>
    </div>
  );
}
