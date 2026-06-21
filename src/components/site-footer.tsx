import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowUp, Facebook, Instagram, Mail, Phone, ShoppingBag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const SETTINGS_KEYS = ["store_name", "footer_text", "contact_email", "contact_phone", "social_instagram", "social_facebook", "social_tiktok"] as const;

function TikTokIcon({ className }: { className?: string }) {
  // lucide-react has no TikTok glyph; minimal inline mark matching stroke style.
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M16 8.5a5 5 0 0 0 4 1.5V13a8 8 0 0 1-4-1.1V16a5 5 0 1 1-5-5h.5v3.1a2 2 0 1 0 1.5 1.93V3h3a5 5 0 0 0 0 5.5Z" />
    </svg>
  );
}

function SocialLink({ href, label, children }: { href: string; label: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label={label}
      className="grid size-9 place-items-center rounded-full border border-border text-muted-foreground transition-all duration-200 hover:border-accent hover:text-accent hover:-translate-y-0.5"
    >
      {children}
    </a>
  );
}

export function SiteFooter() {
  const [vals, setVals] = useState<Record<string, string>>({});

  useEffect(() => {
    supabase.from("app_settings").select("key,value").in("key", SETTINGS_KEYS).then(({ data }) => {
      const obj: Record<string, string> = {};
      (data ?? []).forEach((r) => { if (r.value) obj[r.key] = r.value; });
      setVals(obj);
    });
  }, []);

  const storeName = vals.store_name || "Modern Store";
  const hasSocial = vals.social_instagram || vals.social_facebook || vals.social_tiktok;

  return (
    <footer className="relative border-t">
      <div className="h-px w-full bg-gradient-to-r from-transparent via-accent/50 to-transparent" />

      <div className="container mx-auto px-6 py-14 grid gap-10 md:grid-cols-[1.4fr_1fr_1fr]">
        {/* Brand */}
        <div>
          <Link to="/" className="group inline-flex items-center gap-2 font-display text-lg">
            <ShoppingBag className="size-5 text-accent transition-transform duration-300 group-hover:rotate-[-6deg]" />
            <span className="tracking-tight">{storeName}</span>
          </Link>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">
            {vals.footer_text || "Curated essentials, delivered nationwide."}
          </p>
          {hasSocial && (
            <div className="mt-5 flex items-center gap-2.5">
              {vals.social_instagram && (
                <SocialLink href={vals.social_instagram} label="Instagram">
                  <Instagram className="size-4" />
                </SocialLink>
              )}
              {vals.social_facebook && (
                <SocialLink href={vals.social_facebook} label="Facebook">
                  <Facebook className="size-4" />
                </SocialLink>
              )}
              {vals.social_tiktok && (
                <SocialLink href={vals.social_tiktok} label="TikTok">
                  <TikTokIcon className="size-4" />
                </SocialLink>
              )}
            </div>
          )}
        </div>

        {/* Shop links */}
        <div>
          <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Shop</h3>
          <nav className="mt-4 flex flex-col gap-2.5 text-sm">
            <Link to="/" className="text-foreground/80 transition-colors hover:text-accent">All products</Link>
            <Link to="/sale" className="text-foreground/80 transition-colors hover:text-accent">Sale</Link>
            <Link to="/cart" className="text-foreground/80 transition-colors hover:text-accent">Cart</Link>
          </nav>
        </div>

        {/* Help / contact */}
        <div>
          <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Support</h3>
          <nav className="mt-4 flex flex-col gap-2.5 text-sm">
            <Link to="/faq" className="text-foreground/80 transition-colors hover:text-accent">FAQ</Link>
            <Link to="/terms" className="text-foreground/80 transition-colors hover:text-accent">Terms</Link>
            {vals.contact_email && (
              <a href={`mailto:${vals.contact_email}`} className="flex items-center gap-2 text-foreground/80 transition-colors hover:text-accent">
                <Mail className="size-3.5 shrink-0" /> {vals.contact_email}
              </a>
            )}
            {vals.contact_phone && (
              <a href={`tel:${vals.contact_phone}`} className="flex items-center gap-2 text-foreground/80 transition-colors hover:text-accent">
                <Phone className="size-3.5 shrink-0" /> {vals.contact_phone}
              </a>
            )}
          </nav>
        </div>
      </div>

      <div className="border-t">
        <div className="container mx-auto px-6 py-5 flex flex-col-reverse md:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} {storeName}. All rights reserved.</span>
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="group flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 transition-colors hover:border-accent hover:text-accent"
          >
            Back to top
            <ArrowUp className="size-3.5 transition-transform duration-200 group-hover:-translate-y-0.5" />
          </button>
        </div>
      </div>
    </footer>
  );
}
