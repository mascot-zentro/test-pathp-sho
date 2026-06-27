import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { getLenis } from "@/lib/lenis";
import { slugify } from "@/lib/slugify";
import { useEffect, useRef, useState } from "react";
import { Menu, Search, ShoppingBag, ShoppingCart, User as UserIcon, X, Heart } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCart } from "@/lib/cart";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type SearchResult = { id: string; name: string; image_url: string | null; price: number; sale_price: number | null; on_sale: boolean };

function SearchBar({ onClose }: { onClose?: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); setOpen(false); return; }
    const t = setTimeout(() => {
      supabase.from("products")
        .select("id,name,image_url,price,sale_price,on_sale")
        .eq("active", true)
        .ilike("name", `%${query.trim()}%`)
        .limit(6)
        .then(({ data }) => {
          setResults((data as SearchResult[]) ?? []);
          setOpen(true);
        });
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const go = (name: string) => {
    setOpen(false);
    onClose?.();
    navigate({ to: "/product/$slug", params: { slug: slugify(name) } });
  };

  return (
    <div className="relative w-full">
      <div className="flex items-center border rounded-md px-3 gap-2 bg-background">
        <Search className="size-4 text-muted-foreground shrink-0" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Escape") { setOpen(false); onClose?.(); } }}
          placeholder="Search products…"
          className="flex-1 py-2 text-sm bg-transparent outline-none placeholder:text-muted-foreground"
        />
        {query && (
          <button type="button" onClick={() => { setQuery(""); setResults([]); setOpen(false); }} className="text-muted-foreground hover:text-foreground transition">
            <X className="size-4" />
          </button>
        )}
      </div>
      {open && results.length > 0 && (
        <div className="absolute top-full mt-1 left-0 right-0 z-50 bg-background border rounded-md shadow-lg overflow-hidden">
          {results.map((r) => {
            const displayPrice = r.on_sale && r.sale_price ? r.sale_price : r.price;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => go(r.name)}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-muted transition-colors"
              >
                <div className="size-10 rounded bg-muted shrink-0 overflow-hidden">
                  {r.image_url && <img src={r.image_url} alt="" className="w-full h-full object-cover" />}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{r.name}</div>
                  <div className="text-xs text-muted-foreground">NRS {displayPrice}</div>
                </div>
              </button>
            );
          })}
        </div>
      )}
      {open && query.trim().length >= 2 && results.length === 0 && (
        <div className="absolute top-full mt-1 left-0 right-0 z-50 bg-background border rounded-md shadow-lg px-3 py-3 text-sm text-muted-foreground">
          No products found for "{query}"
        </div>
      )}
    </div>
  );
}

const NAV_LINKS = [
  { to: "/", label: "Shop" },
  { to: "/sale", label: "Sale" },
  { to: "/faq", label: "FAQ" },
  { to: "/track", label: "Track" },
] as const;

function NavLink({ to, label }: { to: string; label: string }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isActive = pathname === to;
  return (
    <Link
      to={to}
      className={cn(
        "relative px-3 py-2 text-xs tracking-[0.14em] uppercase transition-colors duration-200 whitespace-nowrap",
        isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
      <span
        className={cn(
          "pointer-events-none absolute inset-x-3 -bottom-px h-px origin-left scale-x-0 bg-accent transition-transform duration-300 ease-out",
          isActive ? "scale-x-100" : "group-hover:scale-x-100",
        )}
      />
    </Link>
  );
}

export function SiteNav() {
  const { user } = useAuth();
  const { count } = useCart();
  const [storeName, setStoreName] = useState("Store");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [announcement, setAnnouncement] = useState<{ text: string; link: string } | null>(null);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const NAV_CACHE_KEY = "nav_settings";
    const NAV_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
    try {
      const cached = JSON.parse(localStorage.getItem(NAV_CACHE_KEY) ?? "null");
      if (cached && Date.now() - cached.ts < NAV_CACHE_TTL) {
        if (cached.storeName) setStoreName(cached.storeName);
        if (cached.logoUrl) setLogoUrl(cached.logoUrl);
        if (cached.announcement) setAnnouncement(cached.announcement);
        return;
      }
    } catch {}
    supabase.from("app_settings").select("key,value").in("key", ["store_name", "logo_url", "announcement_text", "announcement_link"]).then(({ data }) => {
      let text = "", link = "", sName = "", lUrl = "";
      (data ?? []).forEach((r) => {
        if (r.key === "store_name" && r.value) { setStoreName(r.value); sName = r.value; }
        if (r.key === "logo_url" && r.value) { setLogoUrl(r.value); lUrl = r.value; }
        if (r.key === "announcement_text") text = r.value ?? "";
        if (r.key === "announcement_link") link = r.value ?? "";
      });
      const ann = text ? { text, link } : null;
      if (ann) setAnnouncement(ann);
      try {
        localStorage.setItem(NAV_CACHE_KEY, JSON.stringify({ storeName: sName, logoUrl: lUrl, announcement: ann, ts: Date.now() }));
      } catch {}
    });
  }, []);

  useEffect(() => {
    if (!user) { setIsAdmin(false); return; }
    const ROLE_CACHE_KEY = `admin_role_${user.id}`;
    const ROLE_CACHE_TTL = 10 * 60 * 1000; // 10 minutes
    try {
      const cached = JSON.parse(localStorage.getItem(ROLE_CACHE_KEY) ?? "null");
      if (cached && Date.now() - cached.ts < ROLE_CACHE_TTL) {
        setIsAdmin(cached.isAdmin);
        return;
      }
    } catch {}
    supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle()
      .then(({ data }) => {
        const result = !!data;
        setIsAdmin(result);
        try { localStorage.setItem(`admin_role_${user.id}`, JSON.stringify({ isAdmin: result, ts: Date.now() })); } catch {}
      });
  }, [user]);

  useEffect(() => {
    const lenis = getLenis();
    if (lenis) {
      const handler = ({ scroll }: { scroll: number }) => setScrollProgress(Math.min(1, scroll / 60));
      lenis.on("scroll", handler);
      return () => lenis.off("scroll", handler);
    }
    // Fallback for pages where Lenis hasn't mounted yet
    const onScroll = () => setScrollProgress(Math.min(1, window.scrollY / 60));
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const renderLogo = (className: string) => (
    logoUrl ? (
      <img src={logoUrl} alt={storeName} decoding="async" className={className} />
    ) : (
      <>
        <ShoppingBag className="size-5 text-accent transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110" />
        <span className="tracking-tight">{storeName}</span>
      </>
    )
  );

  return (
    <>
      {announcement && (
        announcement.link ? (
          <Link
            to={announcement.link}
            className="block animate-in fade-in slide-in-from-top-2 duration-500 bg-accent text-accent-foreground text-center text-sm py-2 px-4 transition-opacity hover:opacity-90"
          >
            {announcement.text}
          </Link>
        ) : (
          <div className="animate-in fade-in slide-in-from-top-2 duration-500 bg-accent text-accent-foreground text-center text-sm py-2 px-4">
            {announcement.text}
          </div>
        )
      )}
      <header
        className="sticky top-0 z-40 backdrop-blur-md transition-shadow duration-300"
        style={{
          backgroundColor: `oklch(0.98 0.008 60 / ${0.7 + scrollProgress * 0.28})`,
          borderBottom: `1px solid oklch(0.90 0.012 60 / ${scrollProgress * 0.7})`,
          boxShadow: scrollProgress > 0.1 ? `0 1px ${20 * scrollProgress}px oklch(0 0 0 / ${0.05 * scrollProgress})` : "none",
        }}
      >
        <div className="container mx-auto px-6 h-15 flex items-center justify-between">
          <Link to="/" className="group flex items-center gap-2 font-display text-2xl font-light tracking-tight">
            {renderLogo("h-8 w-auto object-contain transition-transform duration-300 group-hover:scale-105")}
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1 text-sm">
            {!searchOpen && NAV_LINKS.map((l) => (
              <span key={l.to} className="group">
                <NavLink to={l.to} label={l.label} />
              </span>
            ))}
            {!searchOpen && isAdmin && (
              <Link to="/admin" className="px-3 py-2 text-muted-foreground transition-colors hover:text-foreground">
                Admin
              </Link>
            )}

            {/* Search */}
            {searchOpen ? (
              <div className="w-72">
                <SearchBar onClose={() => setSearchOpen(false)} />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                className="px-3 py-2 text-muted-foreground transition-colors hover:text-foreground"
                aria-label="Search"
              >
                <Search className="size-4" />
              </button>
            )}

            <Link
              to="/wishlist"
              className="px-3 py-2 text-muted-foreground transition-colors hover:text-accent"
              aria-label="Wishlist"
              title="Wishlist"
            >
              <Heart className="size-4.5" />
            </Link>
            <Link
              to="/cart"
              className="relative px-3 py-2 text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Cart"
            >
              <ShoppingCart className="size-5" />
              {count > 0 && (
                <span className="absolute -top-0.5 -right-0.5 animate-in zoom-in-50 duration-200 bg-accent text-accent-foreground text-[10px] leading-none rounded-full size-4 grid place-items-center">
                  {count}
                </span>
              )}
            </Link>
            {user ? (
              <Link to="/account" className="px-3 py-2 flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground text-xs tracking-[0.14em] uppercase">
                <UserIcon className="size-3.5" /> Account
              </Link>
            ) : (
              <Link to="/auth">
                <Button variant="outline" size="sm" className="ml-2 text-xs tracking-widest rounded-full transition-all duration-200 hover:bg-accent hover:text-accent-foreground hover:border-accent hover:scale-[1.03]">
                  Sign in
                </Button>
              </Link>
            )}
          </nav>

          {/* Mobile controls */}
          <div className="flex items-center gap-1 md:hidden">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Search">
                  <Search className="size-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="top" className="pt-8 pb-4 px-4">
                <SheetHeader className="sr-only">
                  <SheetTitle>Search</SheetTitle>
                </SheetHeader>
                <SearchBar />
              </SheetContent>
            </Sheet>
            <Link to="/cart" className="relative p-2.5 text-muted-foreground transition-colors hover:text-foreground" aria-label="Cart">
              <ShoppingCart className="size-5" />
              {count > 0 && (
                <span className="absolute top-0.5 right-0.5 animate-in zoom-in-50 duration-200 bg-accent text-accent-foreground text-[10px] leading-none rounded-full size-4 grid place-items-center">
                  {count}
                </span>
              )}
            </Link>
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Open menu">
                  <Menu className="size-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-72 max-w-[85vw] flex flex-col">
                <SheetHeader className="text-left">
                  <SheetTitle className="font-display flex items-center gap-2">
                    {renderLogo("h-7 w-auto object-contain")}
                  </SheetTitle>
                </SheetHeader>
                <nav className="mt-6 flex flex-col gap-1 text-base">
                  {NAV_LINKS.map((l) => (
                    <SheetClose asChild key={l.to}>
                      <Link
                        to={l.to}
                        className="rounded-md px-3 py-2.5 text-foreground/90 transition-colors hover:bg-muted hover:text-foreground"
                      >
                        {l.label}
                      </Link>
                    </SheetClose>
                  ))}
                  <SheetClose asChild>
                    <Link to="/wishlist" className="rounded-md px-3 py-2.5 text-foreground/90 transition-colors hover:bg-muted hover:text-foreground flex items-center gap-2">
                      <Heart className="size-4" /> Wishlist
                    </Link>
                  </SheetClose>
                  {isAdmin && (
                    <SheetClose asChild>
                      <Link to="/admin" className="rounded-md px-3 py-2.5 text-foreground/90 transition-colors hover:bg-muted hover:text-foreground">
                        Admin
                      </Link>
                    </SheetClose>
                  )}
                </nav>
                <div className="mt-auto border-t pt-4">
                  {user ? (
                    <SheetClose asChild>
                      <Link to="/account" className="flex items-center gap-2 rounded-md px-3 py-2.5 text-foreground/90 transition-colors hover:bg-muted hover:text-foreground">
                        <UserIcon className="size-4" /> Account
                      </Link>
                    </SheetClose>
                  ) : (
                    <SheetClose asChild>
                      <Link to="/auth">
                        <Button variant="outline" className="w-full">Sign in</Button>
                      </Link>
                    </SheetClose>
                  )}
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>
    </>
  );
}
