import { createFileRoute, Link } from "@tanstack/react-router";
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

type Product = { id: string; name: string; price: number; sale_price: number | null; image_url: string | null; stock_quantity: number | null };

function SalePage() {
  const [items, setItems] = useState<Product[]>([]);
  useEffect(() => {
    supabase.from("products").select("id,name,price,sale_price,image_url,stock_quantity").eq("active", true).eq("on_sale", true)
      .then(({ data }) => setItems((data as Product[]) ?? []));
  }, []);
  return (
    <div className="min-h-screen flex flex-col">
      <SiteNav />
      <section className="container mx-auto px-6 py-16 flex-1">
        <h1 className="text-4xl md:text-5xl font-display">Sale</h1>
        <p className="mt-2 text-muted-foreground">Selected pieces at reduced prices.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 md:gap-x-6 gap-y-12 mt-10">
          {items.length === 0 && <p className="text-muted-foreground col-span-full">No sale items right now.</p>}
          {items.map((p) => (
            <Link key={p.id} to="/product/$slug" params={{ slug: slugify(p.name) }} className="group">
              <div className="aspect-[4/5] bg-muted overflow-hidden rounded-md relative">
                {p.image_url && <img src={p.image_url} alt={p.name} loading="lazy" decoding="async" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />}
                {p.stock_quantity === 0 ? (
                  <span className="absolute top-2 left-2 bg-background/90 text-destructive text-xs font-medium px-2 py-1 rounded">Out of stock</span>
                ) : p.sale_price ? (
                  <span className="absolute top-2 left-2 bg-accent text-accent-foreground text-[10px] font-medium px-2.5 py-1 rounded-full">
                    −{Math.round((1 - p.sale_price / p.price) * 100)}%
                  </span>
                ) : null}
              </div>
              <div className="mt-3">
                <h3 className="text-sm font-medium leading-snug line-clamp-2">{p.name}</h3>
                <div className="text-sm tabular-nums mt-1 flex items-center gap-1.5 flex-wrap">
                  <span className="text-muted-foreground line-through text-xs">NRS {p.price}</span>
                  <span className="text-accent font-medium">NRS {p.sale_price}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}
