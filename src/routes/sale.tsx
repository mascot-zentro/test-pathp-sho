import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SiteNav } from "@/components/site-nav";

export const Route = createFileRoute("/sale")({
  head: () => ({
    meta: [
      { title: "Sale — Modern Store" },
      { name: "description", content: "Limited-time discounts on selected items." },
    ],
  }),
  component: SalePage,
});

type Product = { id: string; name: string; price: number; sale_price: number | null; image_url: string | null; stock_quantity: number | null };

function SalePage() {
  const [items, setItems] = useState<Product[]>([]);
  useEffect(() => {
    supabase.from("products").select("id,name,price,sale_price,image_url,stock_quantity").eq("active", true).eq("on_sale", true)
      .then(({ data }) => setItems((data as Product[]) ?? []));
  }, []);
  return (
    <div className="min-h-screen">
      <SiteNav />
      <section className="container mx-auto px-6 py-16">
        <h1 className="text-4xl md:text-5xl font-display">Sale</h1>
        <p className="mt-2 text-muted-foreground">Selected pieces at reduced prices.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-12 mt-10">
          {items.length === 0 && <p className="text-muted-foreground col-span-full">No sale items right now.</p>}
          {items.map((p) => (
            <Link key={p.id} to="/product/$id" params={{ id: p.id }} className="group">
              <div className="aspect-[4/5] bg-muted overflow-hidden rounded-md relative">
                {p.image_url && <img src={p.image_url} alt={p.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />}
                {p.stock_quantity === 0 && (
                  <span className="absolute top-2 left-2 bg-background/90 text-destructive text-xs font-medium px-2 py-1 rounded">Out of stock</span>
                )}
              </div>
              <div className="mt-4 flex items-start justify-between">
                <h3 className="text-sm font-medium">{p.name}</h3>
                <div className="text-sm tabular-nums">
                  <span className="text-muted-foreground line-through mr-1">৳{p.price}</span>
                  <span className="text-accent">৳{p.sale_price}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
