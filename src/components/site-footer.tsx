import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const SETTINGS_KEYS = ["store_name", "footer_text", "contact_email", "contact_phone", "social_instagram", "social_facebook", "social_tiktok"] as const;

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

  return (
    <footer className="border-t py-10">
      <div className="container mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground text-center md:text-left">
        <div>
          © {new Date().getFullYear()} {storeName}{vals.footer_text ? ` · ${vals.footer_text}` : ""}
        </div>
        <nav className="flex items-center gap-4">
          <Link to="/faq" className="hover:text-foreground">FAQ</Link>
          <Link to="/terms" className="hover:text-foreground">Terms</Link>
          {vals.contact_email && <a href={`mailto:${vals.contact_email}`} className="hover:text-foreground">{vals.contact_email}</a>}
          {vals.contact_phone && <a href={`tel:${vals.contact_phone}`} className="hover:text-foreground">{vals.contact_phone}</a>}
          {vals.social_instagram && <a href={vals.social_instagram} target="_blank" rel="noreferrer" className="hover:text-foreground">Instagram</a>}
          {vals.social_facebook && <a href={vals.social_facebook} target="_blank" rel="noreferrer" className="hover:text-foreground">Facebook</a>}
          {vals.social_tiktok && <a href={vals.social_tiktok} target="_blank" rel="noreferrer" className="hover:text-foreground">TikTok</a>}
        </nav>
      </div>
    </footer>
  );
}
