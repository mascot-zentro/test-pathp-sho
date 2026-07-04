import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { getLenis } from "@/lib/lenis";
import { slugify } from "@/lib/slugify";
import { useEffect, useRef, useState } from "react";
import { Search, ShoppingBag, ShoppingCart, User as UserIcon, X, Heart, Menu, Sparkles, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCart } from "@/lib/cart";
import { Button } from "@/components/ui/button";
import { useServerFn } from "@tanstack/react-start";
import { aiSearch } from "@/lib/ai.functions";
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
  const [aiMode, setAiMode] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const runAiSearch = useServerFn(aiSearch);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults([]); setOpen(false); setAiMode(false); return; }
    const t = setTimeout(() => {
      supabase.from("products")
        .select("id,name,image_url,price,sale_price,on_sale,category,description")
        .eq("active", true)
        .ilike("name", `%${q}%`)
        .limit(8)
        .then(async ({ data }) => {
          const keyword = (data as SearchResult[]) ?? [];
          // If keyword search returns good results, show them immediately
          if (keyword.length >= 3) {
            setResults(keyword.slice(0, 6));
            setOpen(true);
            setAiMode(false);
          } else {
            // Keyword came up short — try AI semantic search
            setAiLoading(true);
            try {
              const { data: allProducts } = await supabase
                .from("products")
                .select("id,name,category,description,price")
                .eq("active", true)
                .limit(100);
              const ids = await runAiSearch({
                data: {
                  query: q,
                  products: (allProducts ?? []) as { id: string; name: string; category: string | null; description: string | null; price: number }[],
                },
              });
              if (ids && ids.length > 0) {
                // Fetch full details for AI-matched IDs
                const { data: matched } = await supabase
                  .from("products")
                  .select("id,name,image_url,price,sale_price,on_sale")
                  .in("id", ids)
                  .eq("active", true);
                const ordered = ids.map((id) => (matched ?? []).find((p: SearchResult) => p.id === id)).filter(Boolean) as SearchResult[];
                setResults(ordered.slice(0, 6));
                setAiMode(true);
              } else {
                setResults(keyword);
                setAiMode(false);
              }
            } catch {
              setResults(keyword);
              setAiMode(false);
            } finally {
              setAiLoading(false);
            }
            setOpen(true);
          }
        });
    }, 350);
    return () => clearTimeout(t);
  }, [query]);

  const go = (name: string) => {
    setOpen(false);
    onClose?.();
    navigate({ to: "/product/$slug", params: { slug: slugify(name) } });
  };

  return (
    <div className="relative w-full">
      <div className="flex items-center gap-2 border-b border-border/60 px-1 bg-transparent">
        {aiLoading ? <Loader2 className="size-3.5 text-accent shrink-0 animate-spin" /> : <Search className="size-3.5 text-muted-foreground shrink-0" />}
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Escape") { setOpen(false); onClose?.(); } }}
          placeholder="Search or describe what you want…"
          className="flex-1 py-1.5 text-sm bg-transparent outline-none placeholder:text-muted-foreground/60"
        />
        {query && (
          <button type="button" onClick={() => { setQuery(""); setResults([]); setOpen(false); setAiMode(false); onClose?.(); }} className="text-muted-foreground hover:text-foreground transition">
            <X className="size-3.5" />
          </button>
        )}
      </div>
      {open && results.length > 0 && (
        <div className="absolute top-full mt-2 left-0 right-0 z-50 bg-background border border-border/60 rounded-xl shadow-xl overflow-hidden">
          {aiMode && (
            <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border/40 bg-accent/5">
              <Sparkles className="size-3 text-accent" />
              <span className="text-[10px] text-accent font-medium tracking-wide uppercase">AI Results</span>
            </div>
          )}
          {results.map((r) => {
            const displayPrice = r.on_sale && r.sale_price ? r.sale_price : r.price;
            return (
              <button key={r.id} type="button" onClick={() => go(r.name)}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/60 transition-colors">
                <div className="size-9 rounded-lg bg-muted shrink-0 overflow-hidden">
                  {r.image_url && <img src={r.image_url} alt={r.name} className="w-full h-full object-cover" />}
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
      {open && query.trim().length >= 2 && results.length === 0 && !aiLoading && (
        <div className="absolute top-full mt-2 left-0 right-0 z-50 bg-background border border-border/60 rounded-xl shadow-xl px-4 py-3 text-sm text-muted-foreground">
          No results for "{query}"
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
        "relative px-3 py-1 text-sm transition-colors duration-200 whitespace-nowrap",
        isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
      {isActive && (
        <span className="absolute inset-x-3 -bottom-px h-px bg-accent rounded-full" />
      )}
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
  const [impactPublic, setImpactPublic] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const NAV_CACHE_KEY = "nav_settings";
    const NAV_CACHE_TTL = 5 * 60 * 1000;
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
      try { localStorage.setItem(NAV_CACHE_KEY, JSON.stringify({ storeName: sName, logoUrl: lUrl, announcement: ann, ts: Date.now() })); } catch {}
    });
  }, []);

  useEffect(() => {
    supabase.from("impact_settings").select("is_page_public").single()
      .then(({ data }) => { if (data?.is_page_public) setImpactPublic(true); });
  }, []);

  useEffect(() => {
    if (!user) { setIsAdmin(false); return; }
    const ROLE_CACHE_KEY = `admin_role_${user.id}`;
    const ROLE_CACHE_TTL = 10 * 60 * 1000;
    try {
      const cached = JSON.parse(localStorage.getItem(ROLE_CACHE_KEY) ?? "null");
      if (cached && Date.now() - cached.ts < ROLE_CACHE_TTL) { setIsAdmin(cached.isAdmin); return; }
    } catch {}
    supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle()
      .then(({ data }) => {
        const result = !!data;
        setIsAdmin(result);
        try { localStorage.setItem(ROLE_CACHE_KEY, JSON.stringify({ isAdmin: result, ts: Date.now() })); } catch {}
      });
  }, [user]);

  useEffect(() => {
    const lenis = getLenis();
    if (lenis) {
      const handler = ({ scroll }: { scroll: number }) => setScrolled(scroll > 20);
      lenis.on("scroll", handler);
      return () => lenis.off("scroll", handler);
    }
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const renderLogo = (imgClassName: string) => (
    <>
      {logoUrl ? (
        <img src={logoUrl} alt={storeName} decoding="async" className={imgClassName} />
      ) : (
        <ShoppingBag className="size-4 text-accent" />
      )}
      <span>{storeName}</span>
    </>
  );

  return (
    <>
      {announcement && (
        announcement.link ? (
          <Link to={announcement.link}
            className="block bg-accent text-accent-foreground text-center text-xs py-2 px-4 hover:opacity-90 transition-opacity">
            {announcement.text}
          </Link>
        ) : (
          <div className="bg-accent text-accent-foreground text-center text-xs py-2 px-4">
            {announcement.text}
          </div>
        )
      )}
      <header
        className={cn(
          "sticky top-0 z-40 backdrop-blur-md transition-all duration-300",
          scrolled
            ? "bg-background/92 border-b border-border/50 shadow-sm"
            : "bg-background/70 border-b border-transparent"
        )}
      >
        <div className="container mx-auto px-6 h-14 flex items-center justify-between gap-6">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 font-display text-lg font-medium tracking-tight shrink-0">
            {renderLogo("h-8 w-auto object-contain")}
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-0.5">
            {!searchOpen && NAV_LINKS.map((l) => (
              <NavLink key={l.to} to={l.to} label={l.label} />
            ))}
            {!searchOpen && impactPublic && (
              <NavLink to="/impact" label="Impact" />
            )}
            {!searchOpen && isAdmin && (
              <Link to="/admin"
                className="px-3 py-1 text-sm text-muted-foreground hover:text-foreground transition-colors duration-200">
                Admin
              </Link>
            )}
          </nav>

          {/* Desktop actions */}
          <div className="hidden md:flex items-center gap-0.5">
            {searchOpen ? (
              <div className="w-52">
                <SearchBar onClose={() => setSearchOpen(false)} />
              </div>
            ) : (
              <button type="button" onClick={() => setSearchOpen(true)}
                className="size-9 grid place-items-center rounded-full text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors"
                aria-label="Search">
                <Search className="size-3.5" />
              </button>
            )}
            <Link to="/wishlist"
              className="size-9 grid place-items-center rounded-full text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors"
              aria-label="Wishlist">
              <Heart className="size-3.5" />
            </Link>
            <Link to="/cart"
              className="relative size-8 grid place-items-center rounded-full text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors"
              aria-label="Cart">
              <ShoppingCart className="size-3.5" />
              {count > 0 && (
                <span className="absolute top-0.5 right-0.5 bg-accent text-accent-foreground text-[9px] leading-none rounded-full size-3.5 grid place-items-center font-medium">
                  {count}
                </span>
              )}
            </Link>
            {user ? (
              <Link to="/account"
                className="ml-1.5 flex items-center gap-1.5 px-3 py-1 rounded-full border border-border/60 text-xs text-muted-foreground hover:text-foreground hover:border-border transition-all duration-200">
                <UserIcon className="size-3" /> Account
              </Link>
            ) : (
              <Link to="/auth" className="ml-1.5">
                <Button size="sm" className="rounded-full text-xs h-7 px-3.5">
                  Sign in
                </Button>
              </Link>
            )}
          </div>

          {/* Mobile controls */}
          <div className="flex items-center gap-0.5 md:hidden">
            <Sheet>
              <SheetTrigger asChild>
                <button type="button" aria-label="Search"
                  className="size-9 grid place-items-center rounded-full text-muted-foreground hover:text-foreground transition-colors">
                  <Search className="size-4" />
                </button>
              </SheetTrigger>
              <SheetContent side="top" className="pt-6 pb-4 px-5">
                <SheetHeader className="sr-only"><SheetTitle>Search</SheetTitle></SheetHeader>
                <SearchBar />
              </SheetContent>
            </Sheet>
            <Link to="/cart"
              className="relative size-9 grid place-items-center rounded-full text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Cart">
              <ShoppingCart className="size-4" />
              {count > 0 && (
                <span className="absolute top-1 right-1 bg-accent text-accent-foreground text-[9px] leading-none rounded-full size-3.5 grid place-items-center">
                  {count}
                </span>
              )}
            </Link>
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger asChild>
                <button type="button" aria-label="Open menu"
                  className="size-9 grid place-items-center rounded-full text-muted-foreground hover:text-foreground transition-colors">
                  <Menu className="size-4" />
                </button>
              </SheetTrigger>
              <SheetContent side="right" className="w-64 max-w-[85vw] flex flex-col pt-8">
                <SheetHeader className="text-left mb-6">
                  <SheetTitle className="font-display flex items-center gap-2 text-base">
                    {renderLogo("h-6 w-auto object-contain")}
                  </SheetTitle>
                </SheetHeader>
                <nav className="flex flex-col">
                  {NAV_LINKS.map((l) => (
                    <SheetClose asChild key={l.to}>
                      <Link to={l.to}
                        className="px-2 py-2.5 text-sm text-foreground/80 hover:text-foreground rounded-lg hover:bg-muted/60 transition-colors">
                        {l.label}
                      </Link>
                    </SheetClose>
                  ))}
                  {impactPublic && (
                    <SheetClose asChild>
                      <Link to="/impact"
                        className="px-2 py-2.5 text-sm text-foreground/80 hover:text-foreground rounded-lg hover:bg-muted/60 transition-colors">
                        Impact
                      </Link>
                    </SheetClose>
                  )}
                  <SheetClose asChild>
                    <Link to="/wishlist"
                      className="px-2 py-2.5 text-sm text-foreground/80 hover:text-foreground rounded-lg hover:bg-muted/60 transition-colors flex items-center gap-2">
                      <Heart className="size-3.5" /> Wishlist
                    </Link>
                  </SheetClose>
                  {isAdmin && (
                    <SheetClose asChild>
                      <Link to="/admin"
                        className="px-2 py-2.5 text-sm text-foreground/80 hover:text-foreground rounded-lg hover:bg-muted/60 transition-colors">
                        Admin
                      </Link>
                    </SheetClose>
                  )}
                </nav>
                <div className="mt-auto pt-4 border-t border-border/40">
                  {user ? (
                    <SheetClose asChild>
                      <Link to="/account"
                        className="flex items-center gap-2 px-2 py-2.5 text-sm text-foreground/80 hover:text-foreground rounded-lg hover:bg-muted/60 transition-colors">
                        <UserIcon className="size-3.5" /> Account
                      </Link>
                    </SheetClose>
                  ) : (
                    <SheetClose asChild>
                      <Link to="/auth">
                        <Button variant="outline" className="w-full h-9 text-sm">Sign in</Button>
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
