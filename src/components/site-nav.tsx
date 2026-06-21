import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Menu, ShoppingBag, ShoppingCart, User as UserIcon } from "lucide-react";
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

const NAV_LINKS = [
  { to: "/", label: "Shop" },
  { to: "/sale", label: "Sale" },
  { to: "/faq", label: "FAQ" },
] as const;

function NavLink({ to, label }: { to: string; label: string }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isActive = pathname === to;
  return (
    <Link
      to={to}
      className={cn(
        "relative px-3 py-2 text-sm transition-colors",
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
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    supabase.from("app_settings").select("key,value").in("key", ["store_name", "logo_url", "announcement_text", "announcement_link"]).then(({ data }) => {
      let text = "", link = "";
      (data ?? []).forEach((r) => {
        if (r.key === "store_name" && r.value) setStoreName(r.value);
        if (r.key === "logo_url" && r.value) setLogoUrl(r.value);
        if (r.key === "announcement_text") text = r.value ?? "";
        if (r.key === "announcement_link") link = r.value ?? "";
      });
      if (text) setAnnouncement({ text, link });
    });
  }, []);

  useEffect(() => {
    if (!user) { setIsAdmin(false); return; }
    supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle()
      .then(({ data }) => setIsAdmin(!!data));
  }, [user]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const renderLogo = (className: string) => (
    logoUrl ? (
      <img src={logoUrl} alt={storeName} className={className} />
    ) : (
      <>
        <ShoppingBag className="size-5 text-accent transition-transform duration-300 group-hover:rotate-[-6deg] group-hover:scale-110" />
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
        className={cn(
          "sticky top-0 z-40 bg-background/80 backdrop-blur transition-shadow duration-300",
          scrolled ? "border-b shadow-sm" : "border-b border-transparent",
        )}
      >
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="group flex items-center gap-2 font-display text-xl">
            {renderLogo("h-8 w-auto object-contain transition-transform duration-300 group-hover:scale-105")}
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1 text-sm">
            {NAV_LINKS.map((l) => (
              <span key={l.to} className="group">
                <NavLink to={l.to} label={l.label} />
              </span>
            ))}
            {isAdmin && (
              <Link to="/admin" className="px-3 py-2 text-muted-foreground transition-colors hover:text-foreground">
                Admin
              </Link>
            )}
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
              <Link to="/account" className="px-3 py-2 flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground">
                <UserIcon className="size-4" /> Account
              </Link>
            ) : (
              <Link to="/auth">
                <Button variant="outline" size="sm" className="ml-2 transition-transform duration-200 hover:scale-[1.03]">
                  Sign in
                </Button>
              </Link>
            )}
          </nav>

          {/* Mobile controls */}
          <div className="flex items-center gap-1 md:hidden">
            <Link to="/cart" className="relative p-2 text-muted-foreground transition-colors hover:text-foreground" aria-label="Cart">
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
              <SheetContent side="right" className="w-72 flex flex-col">
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
