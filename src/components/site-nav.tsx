import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ShoppingBag, User as UserIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

export function SiteNav() {
  const { user } = useAuth();
  const [storeName, setStoreName] = useState("Store");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    supabase.from("app_settings").select("key,value").in("key", ["store_name", "logo_url"]).then(({ data }) => {
      (data ?? []).forEach((r) => {
        if (r.key === "store_name" && r.value) setStoreName(r.value);
        if (r.key === "logo_url" && r.value) setLogoUrl(r.value);
      });
    });
  }, []);

  useEffect(() => {
    if (!user) { setIsAdmin(false); return; }
    supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle()
      .then(({ data }) => setIsAdmin(!!data));
  }, [user]);

  return (
    <header className="border-b bg-background/80 backdrop-blur sticky top-0 z-40">
      <div className="container mx-auto px-6 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 font-display text-xl">
          {logoUrl ? (
            <img src={logoUrl} alt={storeName} className="h-8 w-auto object-contain" />
          ) : (
            <>
              <ShoppingBag className="size-5 text-accent" />
              <span className="tracking-tight">{storeName}</span>
            </>
          )}
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <Link to="/" className="px-3 py-2 hover:text-accent" activeProps={{ className: "text-accent" }}>Shop</Link>
          <Link to="/sale" className="px-3 py-2 hover:text-accent" activeProps={{ className: "text-accent" }}>Sale</Link>
          {isAdmin && <Link to="/admin" className="px-3 py-2 hover:text-accent">Admin</Link>}
          {user ? (
            <Link to="/account" className="px-3 py-2 flex items-center gap-1.5"><UserIcon className="size-4" /> Account</Link>
          ) : (
            <Link to="/auth"><Button variant="outline" size="sm" className="ml-2">Sign in</Button></Link>
          )}
        </nav>
      </div>
    </header>
  );
}
