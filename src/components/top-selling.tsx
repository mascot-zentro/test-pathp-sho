import { useEffect, useState } from "react";
import { proxyUrl } from "@/lib/img-proxy";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { slugify } from "@/lib/slugify";
import { ArrowRight } from "lucide-react";

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
    <section className="mt-20">
      <div className="flex items-end justify-between mb-6">
        <div>
          <p className="text-[10px] tracking-[0.2em] uppercase text-accent mb-1">Featured</p>
          <h2 className="text-2xl font-display font-light">Top selling</h2>
        </div>
        <Link
          to="/"
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors group"
        >
          View all <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
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
              <div className="aspect-3/4 rounded-xl overflow-hidden bg-muted mb-3 relative">
                {p.image_url ? (
                  <img
                    src={proxyUrl(p.image_url)}
                    alt={p.name}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                ) : (
                  <div className="w-full h-full bg-muted" />
                )}
                {isOnSale && (
                  <span className="absolute top-2 left-2 bg-accent text-accent-foreground text-[10px] font-medium px-1.5 py-0.5 rounded-full">
                    Sale
                  </span>
                )}
              </div>
              <p className="text-sm font-medium truncate leading-snug">{p.name}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                {isOnSale && (
                  <span className="text-xs text-muted-foreground line-through">NRS {p.price}</span>
                )}
                <span className={`text-xs font-medium ${isOnSale ? "text-accent" : "text-muted-foreground"}`}>
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
