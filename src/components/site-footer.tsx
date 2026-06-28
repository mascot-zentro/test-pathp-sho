import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowUp, Facebook, Instagram, Mail, Phone, ShoppingBag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const SETTINGS_KEYS = ["store_name", "footer_text", "contact_email", "contact_phone", "social_instagram", "social_facebook", "social_tiktok"] as const;

function TikTokIcon({ className }: { className?: string }) {
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
      className="grid size-9 place-items-center rounded-full border border-foreground/15 text-foreground/50 transition-all duration-300 hover:border-accent hover:text-accent hover:bg-accent/8 hover:-translate-y-0.5"
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
  const instagram = vals.social_instagram || "https://www.instagram.com/the_aavira/";
  const facebook = vals.social_facebook || "https://www.facebook.com/profile.php?id=61583443176427";
  const tiktok = vals.social_tiktok || "https://www.tiktok.com/@the_aavira";
  const hasSocial = true;

  return (
    <footer className="relative border-t border-border/50 bg-[oklch(0.14_0.012_40)] text-[oklch(0.75_0.008_60)] pb-24 sm:pb-0">
      {/* Accent gradient line */}
      <div className="h-px w-full bg-linear-to-r from-transparent via-accent/60 to-transparent" />

      <div className="container mx-auto px-6 pt-16 pb-10 grid gap-12 md:grid-cols-[1.6fr_1fr_1fr]">

        {/* Brand column */}
        <div>
          <Link to="/" className="group inline-flex items-center gap-2 font-display text-2xl font-light text-[oklch(0.94_0.006_60)]">
            <ShoppingBag className="size-5 text-accent transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110" />
            <span className="tracking-tight">{storeName}</span>
          </Link>
          <p className="mt-4 max-w-xs text-sm leading-relaxed font-light">
            {vals.footer_text || "Curated fashion for the woman who moves with intention."}
          </p>
          {hasSocial && (
            <div className="mt-6 flex items-center gap-2.5">
              <SocialLink href={instagram} label="Instagram">
                <Instagram className="size-4" />
              </SocialLink>
              <SocialLink href={facebook} label="Facebook">
                <Facebook className="size-4" />
              </SocialLink>
              <SocialLink href={tiktok} label="TikTok">
                <TikTokIcon className="size-4" />
              </SocialLink>
            </div>
          )}
        </div>

        {/* Shop links */}
        <div>
          <h3 className="text-[10px] font-medium uppercase tracking-[0.2em] text-[oklch(0.55_0.008_60)] mb-5">Shop</h3>
          <nav className="flex flex-col gap-3 text-sm font-light">
            <Link to="/" className="transition-colors duration-200 hover:text-accent">All products</Link>
            <Link to="/sale" className="transition-colors duration-200 hover:text-accent">Sale</Link>
            <Link to="/cart" className="transition-colors duration-200 hover:text-accent">Cart</Link>
          </nav>
        </div>

        {/* Help / contact */}
        <div>
          <h3 className="text-[10px] font-medium uppercase tracking-[0.2em] text-[oklch(0.55_0.008_60)] mb-5">Support</h3>
          <nav className="flex flex-col gap-3 text-sm font-light">
            <Link to="/faq" className="transition-colors duration-200 hover:text-accent">FAQ</Link>
            <Link to="/terms" className="transition-colors duration-200 hover:text-accent">Terms</Link>
            {vals.contact_email && (
              <a href={`mailto:${vals.contact_email}`} className="flex items-center gap-2 transition-colors duration-200 hover:text-accent">
                <Mail className="size-3.5 shrink-0" /> {vals.contact_email}
              </a>
            )}
            {vals.contact_phone && (
              <a href={`tel:${vals.contact_phone}`} className="flex items-center gap-2 transition-colors duration-200 hover:text-accent">
                <Phone className="size-3.5 shrink-0" /> {vals.contact_phone}
              </a>
            )}
          </nav>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-[oklch(1_0_0/0.07)]">
        <div className="container mx-auto px-6 py-5 flex flex-col md:flex-row items-center justify-between gap-3 text-xs text-[oklch(0.45_0.006_60)]">
          <span>© {new Date().getFullYear()} {storeName}. All rights reserved.</span>
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="group flex items-center gap-1.5 rounded-full border border-[oklch(1_0_0/0.12)] px-4 py-1.5 text-[oklch(0.55_0.008_60)] transition-all duration-200 hover:border-accent hover:text-accent"
          >
            Back to top
            <ArrowUp className="size-3.5 transition-transform duration-200 group-hover:-translate-y-0.5" />
          </button>
        </div>
      </div>
    </footer>
  );
}
