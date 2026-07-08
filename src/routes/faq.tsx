import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  Truck, RotateCcw, CreditCard, MessageCircle, Package, Search, X,
  Mail, Phone, ChevronRight, ShieldCheck, Clock, MapPin,
} from "lucide-react";

export const Route = createFileRoute("/faq")({
  head: () => ({
    meta: [
      { title: "FAQ — The Aavira" },
      { name: "description", content: "Answers to common questions about orders, delivery, payment, returns, and more." },
    ],
  }),
  component: FaqPage,
});

type Faq = { id: string; question: string; answer: string; category?: string };

// Category config — icons + display order
const CATEGORIES: { key: string; label: string; icon: React.ElementType }[] = [
  { key: "all",      label: "All",       icon: MessageCircle },
  { key: "orders",   label: "Orders",    icon: Package },
  { key: "delivery", label: "Delivery",  icon: Truck },
  { key: "payment",  label: "Payment",   icon: CreditCard },
  { key: "returns",  label: "Returns",   icon: RotateCcw },
  { key: "other",    label: "Other",     icon: ShieldCheck },
];

// Keyword → category mapping for FAQs that have no category set
function inferCategory(q: string, a: string): string {
  const text = (q + " " + a).toLowerCase();
  if (/return|refund|exchange|damaged|defective/.test(text)) return "returns";
  if (/deliver|ship|pathao|track|address|arrive|days|valley/.test(text)) return "delivery";
  if (/pay|cash|cod|wallet|transfer|price/.test(text)) return "payment";
  if (/order|cancel|confirm|stock|size|product/.test(text)) return "orders";
  return "other";
}

const TRUST_PILLS = [
  { icon: Truck,       text: "Nationwide delivery" },
  { icon: Clock,       text: "Reply within 1 hour" },
  { icon: MapPin,      text: "Kathmandu & beyond" },
  { icon: ShieldCheck, text: "Secure COD payments" },
];

function FaqPage() {
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [heading, setHeading] = useState("Frequently asked questions");
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");

  useEffect(() => {
    supabase.from("faqs").select("id,question,answer").eq("active", true).order("position")
      .then(({ data }) => { setFaqs((data as Faq[]) ?? []); setLoading(false); });
    supabase.from("app_settings").select("key,value")
      .in("key", ["faq_heading", "contact_email", "contact_phone"])
      .then(({ data }) => {
        (data ?? []).forEach((r) => {
          if (!r.value) return;
          if (r.key === "faq_heading") setHeading(r.value);
          if (r.key === "contact_email") setContactEmail(r.value);
          if (r.key === "contact_phone") setContactPhone(r.value);
        });
      });
  }, []);

  // Enrich with inferred categories
  const enriched = useMemo(() =>
    faqs.map((f) => ({ ...f, category: f.category || inferCategory(f.question, f.answer) })),
    [faqs]
  );

  // Active categories that actually have items
  const usedCategories = useMemo(() => {
    const used = new Set(enriched.map((f) => f.category));
    return CATEGORIES.filter((c) => c.key === "all" || used.has(c.key));
  }, [enriched]);

  const filtered = useMemo(() => {
    let list = enriched;
    if (activeCategory !== "all") list = list.filter((f) => f.category === activeCategory);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((f) => f.question.toLowerCase().includes(q) || f.answer.toLowerCase().includes(q));
    }
    return list;
  }, [enriched, activeCategory, query]);

  const whatsappHref = contactPhone
    ? `https://wa.me/${contactPhone.replace(/\D/g, "")}`
    : undefined;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SiteNav />

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-border/60">
        {/* Subtle radial gradient blob */}
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-0 -translate-x-1/2 w-175 h-85 rounded-full bg-accent/5 blur-3xl" />
        </div>

        <div className="container mx-auto px-6 pt-16 pb-14 md:pt-24 md:pb-20 max-w-3xl text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/5 px-3.5 py-1 text-[10px] font-medium tracking-[0.22em] uppercase text-accent mb-5">
            <MessageCircle className="size-3" />
            Help centre
          </span>

          <h1 className="text-4xl md:text-5xl font-display font-light leading-tight tracking-tight mb-5">
            {heading}
          </h1>

          <p className="text-muted-foreground text-sm max-w-xs mx-auto mb-10 leading-relaxed">
            Browse answers below or search for something specific. Still stuck? We're one message away.
          </p>

          {/* Search bar */}
          <div className="relative max-w-md mx-auto">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
            <input
              type="search"
              placeholder="Search questions…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded-xl border border-border bg-card pl-11 pr-10 py-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/60 transition-all"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Clear search"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        </div>

        {/* Trust pills */}
        <div className="border-t border-border/50 bg-muted/20">
          <div className="container mx-auto px-6 py-4 max-w-3xl">
            <div className="flex flex-wrap justify-center gap-x-6 gap-y-2">
              {TRUST_PILLS.map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Icon className="size-3.5 text-accent shrink-0" />
                  {text}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Category tabs ─────────────────────────────────────────────────── */}
      {!loading && faqs.length > 0 && (
        <div className="sticky top-[var(--nav-h,64px)] z-10 border-b border-border/50 bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/70">
          <div className="container mx-auto px-6 max-w-3xl">
            <div className="flex gap-1 overflow-x-auto py-3 scrollbar-none">
              {usedCategories.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setActiveCategory(key)}
                  className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 py-1.5 text-xs font-medium transition-all shrink-0 ${
                    activeCategory === key
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                >
                  <Icon className="size-3.5" />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── FAQ list ──────────────────────────────────────────────────────── */}
      <section className="flex-1 container mx-auto px-6 py-12 max-w-3xl">

        {loading ? (
          <div className="space-y-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" style={{ opacity: 1 - i * 0.12 }} />
            ))}
          </div>

        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <div className="size-14 rounded-2xl bg-muted mx-auto mb-4 grid place-items-center">
              <Search className="size-6 text-muted-foreground" />
            </div>
            <p className="font-medium mb-1">No results found</p>
            <p className="text-sm text-muted-foreground mb-6">
              {query ? `Nothing matched "${query}". Try different words.` : "No questions in this category yet."}
            </p>
            <button
              onClick={() => { setQuery(""); setActiveCategory("all"); }}
              className="text-sm text-accent hover:underline"
            >
              Clear filters
            </button>
          </div>

        ) : (
          <>
            {/* Result count when filtering */}
            {(query || activeCategory !== "all") && (
              <p className="text-xs text-muted-foreground mb-5">
                {filtered.length} result{filtered.length !== 1 ? "s" : ""}
                {query && <> for <span className="text-foreground font-medium">"{query}"</span></>}
              </p>
            )}

            <Accordion type="single" collapsible className="space-y-2">
              {filtered.map((f, i) => (
                <AccordionItem
                  key={f.id}
                  value={f.id}
                  className="group border border-border/70 rounded-xl overflow-hidden transition-all duration-200 data-[state=open]:border-border data-[state=open]:shadow-sm"
                >
                  <AccordionTrigger className="px-5 py-4 text-left text-sm font-medium hover:no-underline hover:bg-muted/30 data-[state=open]:bg-muted/30 transition-colors [&>svg]:shrink-0 [&>svg]:text-muted-foreground [&>svg]:transition-transform gap-4">
                    <div className="flex items-start gap-3.5 min-w-0">
                      <span className="shrink-0 mt-0.5 size-5 rounded-md bg-accent/10 text-accent text-[10px] font-bold grid place-items-center leading-none">
                        {String(i + 1).padStart(2, "0").slice(-2)}
                      </span>
                      <span className="leading-snug">{f.question}</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-5 pb-5 pt-0">
                    <div className="pl-[2.125rem] text-muted-foreground text-sm leading-relaxed whitespace-pre-line border-l-2 border-accent/20 ml-2.5">
                      {f.answer}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </>
        )}

        {/* ── Still have questions CTA ──────────────────────────────────── */}
        {!loading && (
          <div className="mt-16 rounded-2xl border border-border bg-card overflow-hidden">
            <div className="relative px-8 py-10 text-center">
              {/* subtle bg dot grid */}
              <div
                className="pointer-events-none absolute inset-0 opacity-[0.03]"
                style={{
                  backgroundImage: "radial-gradient(circle, currentColor 1px, transparent 1px)",
                  backgroundSize: "20px 20px",
                }}
              />

              <div className="relative">
                <div className="size-12 rounded-2xl bg-accent/10 mx-auto mb-4 grid place-items-center">
                  <MessageCircle className="size-5 text-accent" />
                </div>

                <h2 className="text-xl font-display font-medium mb-2">Still have a question?</h2>
                <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-7 leading-relaxed">
                  We usually reply within the hour. Reach us on WhatsApp, call, or email — whatever's easiest for you.
                </p>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                  {whatsappHref && (
                    <a
                      href={whatsappHref}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-xl bg-[#25D366] text-white px-5 py-2.5 text-sm font-medium hover:opacity-90 transition-opacity"
                    >
                      {/* WhatsApp icon inline */}
                      <svg viewBox="0 0 24 24" className="size-4 fill-current"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/></svg>
                      Chat on WhatsApp
                    </a>
                  )}
                  {contactPhone && (
                    <a
                      href={`tel:${contactPhone}`}
                      className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-5 py-2.5 text-sm font-medium hover:bg-muted transition-colors"
                    >
                      <Phone className="size-3.5" />
                      {contactPhone}
                    </a>
                  )}
                  {contactEmail && (
                    <a
                      href={`mailto:${contactEmail}`}
                      className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-5 py-2.5 text-sm font-medium hover:bg-muted transition-colors"
                    >
                      <Mail className="size-3.5" />
                      Email us
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Policy quick-links ────────────────────────────────────────── */}
        {!loading && (
          <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { to: "/refund-policy", label: "Refund & Return Policy", icon: RotateCcw },
              { to: "/shipping-policy", label: "Shipping Policy", icon: Truck },
              { to: "/terms", label: "Terms & Conditions", icon: ShieldCheck },
            ].map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to as any}
                className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-card px-4 py-3.5 text-sm hover:border-border hover:bg-muted/30 transition-all group"
              >
                <div className="flex items-center gap-3">
                  <div className="size-7 rounded-lg bg-muted grid place-items-center shrink-0">
                    <Icon className="size-3.5 text-muted-foreground" />
                  </div>
                  <span className="font-medium leading-tight">{label}</span>
                </div>
                <ChevronRight className="size-3.5 text-muted-foreground shrink-0 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            ))}
          </div>
        )}
      </section>

      <SiteFooter />
    </div>
  );
}
