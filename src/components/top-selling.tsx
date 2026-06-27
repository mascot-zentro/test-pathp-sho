import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { slugify } from "@/lib/slugify";
import { Flame } from "lucide-react";

type Product = {
  id: string;
  name: string;
  price: number;
  sale_price: number | null;
  on_sale: boolean;
  image_url: string | null;
};

export function TopSelling() {
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    supabase
      .from("products")
      .select("id,name,price,sale_price,on_sale,image_url")
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(4)
      .then(({ data }) => setProducts((data as Product[]) ?? []));
  }, []);

  if (products.length === 0) return null;

  return (
    <section className="mt-16 border-t pt-12">
      <div className="flex items-center gap-2 mb-6">
        <Flame className="size-4 text-accent" />
        <h2 className="text-lg font-display font-medium tracking-tight">Top selling</h2>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {products.map((p) => {
          const displayPrice = p.on_sale && p.sale_price ? p.sale_price : p.price;
          const isOnSale = p.on_sale && p.sale_price;
          return (
            <Link
              key={p.id}
              to="/product/$slug"
              params={{ slug: slugify(p.name) }}
              className="group block"
            >
              <div className="aspect-[3/4] rounded-lg overflow-hidden bg-muted mb-2.5">
                {p.image_url ? (
                  <img
                    src={p.image_url}
                    alt={p.name}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                ) : (
                  <div className="w-full h-full bg-muted" />
                )}
              </div>
              <p className="text-sm font-medium truncate leading-tight">{p.name}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                {isOnSale && (
                  <span className="text-xs text-muted-foreground line-through">NRS {p.price}</span>
                )}
                <span className={`text-xs ${isOnSale ? "text-accent font-medium" : "text-muted-foreground"}`}>
                  NRS {displayPrice}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
