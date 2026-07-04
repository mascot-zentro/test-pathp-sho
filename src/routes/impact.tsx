import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ExternalLink, Download, Loader2, ArrowRight, ArrowUpRight } from "lucide-react";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { Reveal } from "@/components/reveal";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/impact")({
  head: () => ({
    meta: [
      { title: "Aavira Impact — Fashion that creates change" },
      {
        name: "description",
        content:
          "A percentage of every Aavira sale goes to the Aavira Impact Fund — funding vetted community projects across Nepal. Full transparency, public ledger.",
      },
      { property: "og:title", content: "Aavira Impact Fund" },
      {
        property: "og:description",
        content: "Every purchase creates real change. See exactly where the money goes.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  ssr: false,
  component: ImpactPage,
});

// ─── Types ───────────────────────────────────────────────────────────────────

type Settings = {
  contribution_percentage: number;
  fund_display_name: string;
  is_page_public: boolean;
  is_public_ledger_visible: boolean;
  excluded_costs_note: string | null;
};
type FundEntry = {
  id: string; month: number; year: number;
  total_revenue: number; contribution_amount: number | null;
  status: "accrued" | "disbursed"; notes: string | null;
};
type Project = {
  id: string; title: string; description: string | null;
  cover_image: string | null; status: "planned" | "ongoing" | "completed";
  partner_org_name: string | null; partner_org_url: string | null;
  display_order: number;
};
type Disbursement = {
  id: string; amount: number; disbursed_date: string;
  receipt_url: string | null; notes: string | null; project_id: string | null;
};
type Update = {
  id: string; title: string; body: string | null;
  images: string[] | null; linked_project_id: string | null;
  published_at: string; is_featured: boolean;
};
type Testimonial = {
  id: string; beneficiary_name: string | null;
  photo: string | null; quote: string; linked_project_id: string | null;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function fmt(n: number) {
  return new Intl.NumberFormat("en-NP", { style: "currency", currency: "NPR", maximumFractionDigits: 0 }).format(n);
}

function downloadCSV(entries: FundEntry[]) {
  const rows = [
    ["Month","Year","Revenue (NPR)","Contribution (NPR)","Status","Notes"],
    ...entries.map((e) => [MONTHS[e.month-1],e.year,e.total_revenue,e.contribution_amount??"",e.status,e.notes??""]),
  ];
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "aavira-impact-ledger.csv"; a.click();
  URL.revokeObjectURL(url);
}

// ─── Animated number (intersection-triggered) ─────────────────────────────────

function Counter({ end, duration = 1600 }: { end: number; duration?: number }) {
  const [val, setVal] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const fired = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !fired.current) {
        fired.current = true;
        const t0 = performance.now();
        const tick = (now: number) => {
          const p = Math.min((now - t0) / duration, 1);
          setVal(Math.round((1 - Math.pow(1 - p, 4)) * end));
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }
    }, { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, [end, duration]);
  return <span ref={ref}>{val.toLocaleString("en-NP")}</span>;
}

// ─── Thin rule divider ────────────────────────────────────────────────────────

function Rule({ className }: { className?: string }) {
  return <div className={cn("w-full h-px bg-foreground/10", className)} />;
}

// ─── Status label (text only — no pill) ──────────────────────────────────────

function StatusLabel({ status }: { status: string }) {
  const color: Record<string, string> = {
    accrued: "text-amber-600",
    disbursed: "text-emerald-700",
    planned: "text-muted-foreground",
    ongoing: "text-accent",
    completed: "text-emerald-700",
  };
  return (
    <span className={cn("text-[11px] font-medium tracking-[0.12em] uppercase", color[status] ?? "text-muted-foreground")}>
      {status}
    </span>
  );
}

// ─── Suggest form ────────────────────────────────────────────────────────────

function SuggestForm() {
  const [form, setForm] = useState({ name: "", email: "", suggestion: "" });
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.suggestion.trim()) return;
    setLoading(true);
    const db = supabase as any;
    await db.from("impact_cause_suggestions").insert({ name: form.name||null, email: form.email||null, suggestion: form.suggestion });
    setLoading(false);
    setDone(true);
  };

  if (done) {
    return (
      <div className="py-16 text-center">
        <p className="font-display text-3xl font-light mb-3">Thank you.</p>
        <p className="text-sm text-muted-foreground mb-6">We review every suggestion when planning future initiatives.</p>
        <button
          onClick={() => { setDone(false); setForm({ name:"",email:"",suggestion:"" }); }}
          className="text-sm underline underline-offset-4 text-muted-foreground hover:text-foreground transition-colors"
        >
          Submit another
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="grid sm:grid-cols-2 gap-5">
        <div className="space-y-2">
          <Label htmlFor="sg-name" className="text-xs tracking-widest uppercase text-muted-foreground">
            Name <span className="font-normal">(optional)</span>
          </Label>
          <Input id="sg-name" placeholder="Asha Tamang" value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="rounded-none border-0 border-b border-border/60 bg-transparent px-0 focus-visible:ring-0 focus-visible:border-foreground transition-colors placeholder:text-muted-foreground/40" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="sg-email" className="text-xs tracking-widest uppercase text-muted-foreground">
            Email <span className="font-normal">(optional)</span>
          </Label>
          <Input id="sg-email" type="email" placeholder="asha@example.com" value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            className="rounded-none border-0 border-b border-border/60 bg-transparent px-0 focus-visible:ring-0 focus-visible:border-foreground transition-colors placeholder:text-muted-foreground/40" />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="sg-suggestion" className="text-xs tracking-widest uppercase text-muted-foreground">
          Your suggestion <span className="text-accent">*</span>
        </Label>
        <Textarea id="sg-suggestion" rows={5} required
          placeholder="Describe the cause or community you'd like us to support…"
          value={form.suggestion}
          onChange={(e) => setForm((f) => ({ ...f, suggestion: e.target.value }))}
          className="rounded-none border-0 border-b border-border/60 bg-transparent px-0 focus-visible:ring-0 focus-visible:border-foreground transition-colors resize-none placeholder:text-muted-foreground/40" />
      </div>
      <button
        type="submit" disabled={loading}
        className="group inline-flex items-center gap-3 text-sm tracking-widest uppercase font-medium transition-all duration-200 hover:gap-4 disabled:opacity-50"
      >
        {loading ? <Loader2 className="size-4 animate-spin" /> : null}
        Submit suggestion
        <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-1" />
      </button>
    </form>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

function ImpactPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [entries, setEntries] = useState<FundEntry[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [disbursements, setDisbursements] = useState<Disbursement[]>([]);
  const [updates, setUpdates] = useState<Update[]>([]);
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [loading, setLoading] = useState(true);

  // Scroll-parallax on hero image overlay
  const heroRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = heroRef.current;
    if (!el) return;
    const onScroll = () => {
      const t = window.scrollY * 0.3;
      el.style.transform = `translateY(${t}px)`;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const db = supabase as any;
    Promise.all([
      db.from("impact_settings").select("*").limit(1).single(),
      db.from("impact_fund_entries").select("*").order("year",{ascending:false}).order("month",{ascending:false}),
      db.from("impact_projects").select("*").eq("is_published",true).order("display_order"),
      db.from("impact_disbursements").select("*").order("disbursed_date",{ascending:false}),
      db.from("impact_updates").select("*").not("published_at","is",null).order("is_featured",{ascending:false}).order("published_at",{ascending:false}),
      db.from("impact_testimonials").select("*").eq("is_published",true),
    ]).then(([s,e,p,d,u,t]) => {
      if (s.data) setSettings(s.data);
      if (e.data) setEntries(e.data);
      if (p.data) setProjects(p.data);
      if (d.data) setDisbursements(d.data);
      if (u.data) setUpdates(u.data);
      if (t.data) setTestimonials(t.data);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (settings?.is_page_public === false) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-background">
        <p className="font-display text-3xl font-light">Coming soon</p>
        <p className="text-sm text-muted-foreground">The Aavira Impact page is not yet public.</p>
      </div>
    );
  }

  const pct = settings?.contribution_percentage ?? 5;
  const fundName = settings?.fund_display_name ?? "Aavira Impact Fund";
  const totalCommitted = entries.reduce((a,e) => a + (e.contribution_amount ?? (e.total_revenue * pct / 100)), 0);
  const totalDisbursed = disbursements.reduce((a,d) => a + d.amount, 0);
  const totalRevenue = entries.reduce((a,e) => a + e.total_revenue, 0);
  const lastEntry = entries[0];
  const lastEntryDate = lastEntry ? `${MONTHS[lastEntry.month-1]} ${lastEntry.year}` : "—";

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <SiteNav />

      {/* ─── HERO ──────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden grain" style={{ minHeight: "95vh" }}>
        {/* Parallax tinted wash */}
        <div
          ref={heroRef}
          className="absolute inset-0 -z-10 will-change-transform"
          style={{ top: "-10%", height: "120%" }}
        >
          <div className="absolute inset-0 bg-[oklch(0.96_0.014_358)]" />
          {/* Vertical ink lines — purely decorative architectural grid */}
          {[15,30,50,70,85].map((x) => (
            <div
              key={x}
              className="absolute top-0 bottom-0 w-px bg-foreground/5"
              style={{ left: `${x}%` }}
            />
          ))}
        </div>

        <div className="container mx-auto px-8 md:px-16 max-w-7xl h-full flex flex-col justify-end pb-20 md:pb-28" style={{ minHeight: "95vh" }}>
          {/* Top rule + label */}
          <Reveal>
            <div className="flex items-center gap-5 mb-16 md:mb-20 pt-8">
              <Rule className="w-12 bg-foreground/20" />
              <span className="text-[10px] tracking-[0.35em] uppercase text-muted-foreground">{fundName}</span>
            </div>
          </Reveal>

          {/* Main headline — editorial scale */}
          <div className="grid lg:grid-cols-[1fr_auto] gap-12 items-end">
            <div>
              <Reveal delay={40}>
                <h1 className="font-display font-light leading-[0.88] tracking-tight" style={{ fontSize: "clamp(3.5rem, 10vw, 9rem)" }}>
                  Fashion<br />
                  <em className="not-italic text-accent">that gives</em><br />
                  back.
                </h1>
              </Reveal>
              <Reveal delay={120}>
                <p className="mt-8 text-base md:text-lg text-muted-foreground font-light max-w-md leading-relaxed">
                  {pct}% of every Aavira order flows into the {fundName} — funding vetted projects that create lasting change for women and communities across Nepal.
                </p>
              </Reveal>
              <Reveal delay={180}>
                <div className="mt-10 flex items-center gap-6">
                  <Link
                    to="/"
                    className="group inline-flex items-center gap-3 text-sm tracking-widest uppercase font-medium border-b border-foreground/30 pb-0.5 transition-all duration-200 hover:border-accent hover:text-accent hover:gap-4"
                  >
                    Shop & create impact
                    <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-1" />
                  </Link>
                  {settings?.is_public_ledger_visible && entries.length > 0 && (
                    <a
                      href="#ledger"
                      className="text-sm text-muted-foreground tracking-wide uppercase hover:text-foreground transition-colors border-b border-transparent hover:border-foreground/30 pb-0.5"
                    >
                      View ledger
                    </a>
                  )}
                </div>
              </Reveal>
            </div>

            {/* Right — key numbers stacked vertically */}
            <Reveal delay={100} direction="left">
              <div className="lg:min-w-55 space-y-0 border-l border-foreground/10 pl-10 hidden lg:block">
                {[
                  { label: "Net profit tracked", value: fmt(totalRevenue) },
                  { label: "Total committed", value: fmt(totalCommitted) },
                  { label: "Total disbursed", value: fmt(totalDisbursed) },
                  { label: "Last recorded", value: lastEntryDate },
                ].map(({ label, value }, i) => (
                  <div key={label} className={cn("py-5", i > 0 && "border-t border-foreground/8")}>
                    <div className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground mb-1">{label}</div>
                    <div className="font-display text-xl font-light text-foreground">{value}</div>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>

          {/* Bottom — the equation */}
          <Reveal delay={220}>
            <div className="mt-16 pt-8 border-t border-foreground/10 flex flex-wrap gap-x-8 gap-y-3 items-center">
              <span className="text-xs tracking-[0.15em] uppercase text-muted-foreground">The model</span>
              <div className="flex items-center gap-4 text-sm font-light">
                <span className="text-muted-foreground">Your order</span>
                <span className="text-foreground/30">×</span>
                <span className="font-medium text-accent">{pct}%</span>
                <span className="text-foreground/30">=</span>
                <span className="text-foreground">Direct community impact</span>
              </div>
              {settings?.excluded_costs_note && (
                <span className="text-[11px] text-muted-foreground/60 max-w-xs">{settings.excluded_costs_note}</span>
              )}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ─── MOBILE STATS (visible < lg) ────────────────────────────────────── */}
      <section className="lg:hidden border-t border-foreground/10">
        <div className="grid grid-cols-2 divide-x divide-y divide-foreground/8">
          {[
            { label: "Net profit tracked", raw: totalRevenue, formatted: fmt(totalRevenue) },
            { label: "Total committed", raw: totalCommitted, formatted: fmt(totalCommitted) },
            { label: "Total disbursed", raw: totalDisbursed, formatted: fmt(totalDisbursed) },
            { label: "Last recorded", raw: null, formatted: lastEntryDate },
          ].map(({ label, formatted }) => (
            <div key={label} className="px-6 py-8">
              <div className="font-display text-xl font-light mb-1">{formatted}</div>
              <div className="text-[10px] tracking-[0.15em] uppercase text-muted-foreground">{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ─── LEDGER ─────────────────────────────────────────────────────────── */}
      {settings?.is_public_ledger_visible && entries.length > 0 && (
        <section id="ledger" className="border-t border-foreground/10">
          <div className="container mx-auto px-8 md:px-16 max-w-7xl py-24 md:py-32">
            <Reveal>
              <div className="flex items-end justify-between flex-wrap gap-6 mb-16">
                <div>
                  <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground mb-3">Full transparency</p>
                  <h2 className="font-display font-light" style={{ fontSize: "clamp(2rem, 5vw, 4rem)" }}>Monthly Ledger</h2>
                </div>
                <button
                  onClick={() => downloadCSV(entries)}
                  className="group inline-flex items-center gap-2 text-xs tracking-widest uppercase text-muted-foreground hover:text-foreground transition-colors border-b border-transparent hover:border-foreground/30 pb-0.5"
                >
                  <Download className="size-3.5" />
                  Download CSV
                </button>
              </div>
            </Reveal>

            <Reveal delay={60}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-foreground/10">
                      <th className="text-left py-3 pr-8 text-[10px] tracking-[0.2em] uppercase text-muted-foreground font-normal">Period</th>
                      <th className="text-right py-3 pr-8 text-[10px] tracking-[0.2em] uppercase text-muted-foreground font-normal">Revenue</th>
                      <th className="text-right py-3 pr-8 text-[10px] tracking-[0.2em] uppercase text-muted-foreground font-normal">Contribution</th>
                      <th className="text-left py-3 pr-8 text-[10px] tracking-[0.2em] uppercase text-muted-foreground font-normal">Status</th>
                      <th className="text-left py-3 text-[10px] tracking-[0.2em] uppercase text-muted-foreground font-normal hidden md:table-cell">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((e, i) => (
                      <tr
                        key={e.id}
                        className={cn(
                          "border-b border-foreground/6 transition-colors hover:bg-foreground/2",
                          i % 2 === 1 && "bg-foreground/1.5",
                        )}
                      >
                        <td className="py-4 pr-8 font-medium text-foreground">{MONTHS[e.month-1]} {e.year}</td>
                        <td className="py-4 pr-8 text-right text-muted-foreground tabular-nums">{fmt(e.total_revenue)}</td>
                        <td className="py-4 pr-8 text-right font-medium text-accent tabular-nums">
                          {e.contribution_amount != null ? fmt(e.contribution_amount) : fmt(e.total_revenue * pct / 100)}
                        </td>
                        <td className="py-4 pr-8"><StatusLabel status={e.status} /></td>
                        <td className="py-4 text-muted-foreground/60 text-xs hidden md:table-cell max-w-xs truncate">
                          {e.notes ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-foreground/15">
                      <td className="py-4 pr-8 text-xs tracking-widest uppercase text-muted-foreground">Total</td>
                      <td className="py-4 pr-8 text-right font-medium tabular-nums">{fmt(totalRevenue)}</td>
                      <td className="py-4 pr-8 text-right font-semibold text-accent tabular-nums">{fmt(totalCommitted)}</td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </Reveal>
          </div>
        </section>
      )}

      {/* ─── PROJECTS ───────────────────────────────────────────────────────── */}
      {projects.length > 0 && (
        <section className="border-t border-foreground/10 bg-[oklch(0.975_0.006_60)]">
          <div className="container mx-auto px-8 md:px-16 max-w-7xl py-24 md:py-32">
            <Reveal>
              <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground mb-3">What we fund</p>
              <h2 className="font-display font-light mb-16" style={{ fontSize: "clamp(2rem, 5vw, 4rem)" }}>
                Impact Projects
              </h2>
            </Reveal>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-px bg-foreground/8">
              {projects.map((p, i) => (
                <Reveal key={p.id} delay={i * 60}>
                  <article className="bg-background group flex flex-col h-full">
                    {p.cover_image ? (
                      <div className="aspect-3/2 overflow-hidden bg-muted">
                        <img
                          src={p.cover_image}
                          alt={p.title}
                          loading="lazy"
                          className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                        />
                      </div>
                    ) : (
                      <div className="aspect-3/2 bg-[oklch(0.96_0.014_358/0.4)]" />
                    )}
                    <div className="p-7 flex flex-col flex-1 gap-4">
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="font-display text-xl font-light leading-snug">{p.title}</h3>
                        <StatusLabel status={p.status} />
                      </div>
                      {p.description && (
                        <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3 flex-1">
                          {p.description}
                        </p>
                      )}
                      {p.partner_org_name && (
                        <div className="text-xs text-muted-foreground mt-auto pt-4 border-t border-foreground/8">
                          Partner:{" "}
                          {p.partner_org_url ? (
                            <a
                              href={p.partner_org_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-foreground hover:text-accent transition-colors inline-flex items-center gap-1"
                            >
                              {p.partner_org_name}
                              <ArrowUpRight className="size-3" />
                            </a>
                          ) : (
                            <span className="text-foreground">{p.partner_org_name}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </article>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ─── DISBURSEMENTS ──────────────────────────────────────────────────── */}
      {disbursements.length > 0 && (
        <section className="border-t border-foreground/10">
          <div className="container mx-auto px-8 md:px-16 max-w-7xl py-24 md:py-32">
            <Reveal>
              <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground mb-3">Where the money goes</p>
              <h2 className="font-display font-light mb-16" style={{ fontSize: "clamp(2rem, 5vw, 4rem)" }}>
                Disbursements
              </h2>
            </Reveal>

            <div className="space-y-0 border-t border-foreground/10">
              {disbursements.map((d, i) => (
                <Reveal key={d.id} delay={i * 40}>
                  <div className="group flex items-baseline gap-6 md:gap-12 py-6 border-b border-foreground/8 hover:bg-foreground/1.5 transition-colors px-2 -mx-2">
                    <div className="text-[10px] tracking-[0.12em] uppercase text-muted-foreground shrink-0 w-28 hidden sm:block">
                      {new Date(d.disbursed_date).toLocaleDateString("en-NP", { year: "numeric", month: "short" })}
                    </div>
                    <div className="font-display text-2xl md:text-3xl font-light text-foreground shrink-0">
                      {fmt(d.amount)}
                    </div>
                    <div className="flex-1 min-w-0">
                      {d.notes && <p className="text-sm text-muted-foreground leading-relaxed">{d.notes}</p>}
                      <div className="text-[10px] tracking-[0.12em] uppercase text-muted-foreground sm:hidden mt-1">
                        {new Date(d.disbursed_date).toLocaleDateString("en-NP", { year: "numeric", month: "long", day: "numeric" })}
                      </div>
                    </div>
                    {d.receipt_url && (
                      <a
                        href={d.receipt_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 text-xs tracking-widest uppercase text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1.5 border-b border-transparent hover:border-foreground/30 pb-0.5"
                      >
                        Receipt <ExternalLink className="size-3" />
                      </a>
                    )}
                  </div>
                </Reveal>
              ))}
            </div>

            <Reveal delay={60}>
              <div className="mt-8 flex items-baseline gap-6 md:gap-12 py-4 border-t-2 border-foreground/15 px-2 -mx-2">
                <div className="hidden sm:block w-28" />
                <div className="font-display text-2xl md:text-3xl font-light text-accent">{fmt(totalDisbursed)}</div>
                <div className="text-xs tracking-[0.12em] uppercase text-muted-foreground">Total disbursed</div>
              </div>
            </Reveal>
          </div>
        </section>
      )}

      {/* ─── STORIES ────────────────────────────────────────────────────────── */}
      {updates.length > 0 && (
        <section className="border-t border-foreground/10 bg-[oklch(0.975_0.006_60)]">
          <div className="container mx-auto px-8 md:px-16 max-w-7xl py-24 md:py-32">
            <Reveal>
              <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground mb-3">From the field</p>
              <h2 className="font-display font-light mb-16" style={{ fontSize: "clamp(2rem, 5vw, 4rem)" }}>
                Stories & Updates
              </h2>
            </Reveal>

            {/* Featured update spans full width */}
            {updates.filter((u) => u.is_featured).slice(0, 1).map((u) => (
              <Reveal key={u.id}>
                <article className="mb-16 grid md:grid-cols-2 gap-px bg-foreground/8 group">
                  {u.images && u.images.length > 0 ? (
                    <div className="aspect-4/3 md:aspect-auto overflow-hidden bg-muted">
                      <img
                        src={u.images[0]}
                        alt=""
                        loading="lazy"
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                      />
                    </div>
                  ) : (
                    <div className="aspect-4/3 md:aspect-auto min-h-64 bg-[oklch(0.96_0.014_358/0.3)]" />
                  )}
                  <div className="bg-background p-10 md:p-14 flex flex-col justify-between">
                    <div>
                      <p className="text-[10px] tracking-[0.25em] uppercase text-accent mb-6">Featured</p>
                      <h3 className="font-display text-3xl md:text-4xl font-light leading-snug mb-5">{u.title}</h3>
                      {u.body && (
                        <p className="text-muted-foreground leading-relaxed line-clamp-5">{u.body}</p>
                      )}
                    </div>
                    <time dateTime={u.published_at} className="text-xs tracking-widest uppercase text-muted-foreground/60 mt-8">
                      {new Date(u.published_at).toLocaleDateString("en-NP", { year:"numeric", month:"long", day:"numeric" })}
                    </time>
                  </div>
                </article>
              </Reveal>
            ))}

            {/* Rest of updates */}
            <div className="grid md:grid-cols-2 gap-px bg-foreground/8">
              {updates.filter((u) => !u.is_featured).map((u, i) => (
                <Reveal key={u.id} delay={i * 50}>
                  <article className="bg-background group flex flex-col">
                    {u.images && u.images.length > 0 && (
                      <div className="aspect-video overflow-hidden bg-muted">
                        <img
                          src={u.images[0]}
                          alt=""
                          loading="lazy"
                          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                        />
                      </div>
                    )}
                    <div className="p-8 flex flex-col flex-1 gap-3">
                      <h3 className="font-display text-xl font-light leading-snug">{u.title}</h3>
                      {u.body && (
                        <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3 flex-1">{u.body}</p>
                      )}
                      <time dateTime={u.published_at} className="text-[10px] tracking-widest uppercase text-muted-foreground/50 mt-2">
                        {new Date(u.published_at).toLocaleDateString("en-NP", { year:"numeric", month:"long", day:"numeric" })}
                      </time>
                    </div>
                  </article>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ─── TESTIMONIALS ───────────────────────────────────────────────────── */}
      {testimonials.length > 0 && (
        <section className="border-t border-foreground/10">
          <div className="container mx-auto px-8 md:px-16 max-w-7xl py-24 md:py-32">
            <Reveal>
              <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground mb-3">Their words</p>
              <h2 className="font-display font-light mb-16" style={{ fontSize: "clamp(2rem, 5vw, 4rem)" }}>
                Voices from the ground
              </h2>
            </Reveal>

            <div className="space-y-0 border-t border-foreground/10">
              {testimonials.map((t, i) => (
                <Reveal key={t.id} delay={i * 50}>
                  <figure className="grid md:grid-cols-[200px_1fr] gap-8 md:gap-16 py-10 border-b border-foreground/8 group hover:bg-foreground/1.5 transition-colors px-2 -mx-2">
                    <figcaption className="flex items-center md:items-start gap-4 md:flex-col md:gap-3">
                      {t.photo ? (
                        <img
                          src={t.photo}
                          alt={t.beneficiary_name ?? ""}
                          loading="lazy"
                          className="size-12 md:size-16 rounded-full object-cover border border-foreground/10 shrink-0"
                        />
                      ) : (
                        <div className="size-12 md:size-16 rounded-full bg-foreground/6 grid place-items-center shrink-0 border border-foreground/8">
                          <span className="font-display text-lg text-muted-foreground">
                            {t.beneficiary_name?.[0]?.toUpperCase() ?? "?"}
                          </span>
                        </div>
                      )}
                      <span className="font-medium text-sm text-foreground">{t.beneficiary_name ?? "Anonymous"}</span>
                    </figcaption>
                    <blockquote className="font-display text-xl md:text-2xl font-light leading-relaxed text-foreground/80 italic">
                      "{t.quote}"
                    </blockquote>
                  </figure>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ─── SUGGEST A CAUSE ────────────────────────────────────────────────── */}
      <section className="border-t border-foreground/10 bg-[oklch(0.975_0.006_60)]">
        <div className="container mx-auto px-8 md:px-16 max-w-7xl py-24 md:py-32">
          <div className="grid lg:grid-cols-2 gap-16 lg:gap-24">
            <Reveal>
              <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground mb-3">Have an idea?</p>
              <h2 className="font-display font-light mb-6" style={{ fontSize: "clamp(2rem, 5vw, 4rem)" }}>
                Suggest<br />a cause
              </h2>
              <p className="text-muted-foreground font-light leading-relaxed max-w-sm">
                Know a community or cause that deserves support? We consider every suggestion when planning future initiatives.
              </p>
            </Reveal>
            <Reveal delay={80}>
              <SuggestForm />
            </Reveal>
          </div>
        </div>
      </section>

      {/* ─── CTA ────────────────────────────────────────────────────────────── */}
      <section className="border-t border-foreground/10 bg-foreground text-background relative overflow-hidden grain">
        {/* Subtle vertical grid on dark bg */}
        {[20,40,60,80].map((x) => (
          <div key={x} className="absolute top-0 bottom-0 w-px bg-background/5" style={{ left:`${x}%` }} />
        ))}
        <div className="relative container mx-auto px-8 md:px-16 max-w-7xl py-28 md:py-40">
          <div className="grid lg:grid-cols-[1fr_auto] gap-12 items-end">
            <Reveal>
              <p className="text-[10px] tracking-[0.3em] uppercase text-background/40 mb-5">
                Ready to make a difference?
              </p>
              <h2 className="font-display font-light leading-[0.9] tracking-tight" style={{ fontSize: "clamp(3rem, 8vw, 7rem)" }}>
                Every order<br />
                <em className="not-italic text-accent">matters.</em>
              </h2>
              <p className="mt-8 text-background/50 font-light max-w-md leading-relaxed">
                When you shop at Aavira, {pct}% of your purchase goes straight into the {fundName} — no middlemen, full transparency, real impact.
              </p>
            </Reveal>
            <Reveal delay={100} direction="left">
              <div className="flex flex-col gap-4">
                <Link
                  to="/"
                  className="group inline-flex items-center gap-3 text-sm tracking-widest uppercase font-medium text-background border-b border-background/30 pb-0.5 transition-all duration-200 hover:border-accent hover:text-accent hover:gap-4 whitespace-nowrap"
                >
                  Shop & create impact
                  <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-1" />
                </Link>
                {settings?.is_public_ledger_visible && (
                  <a
                    href="#ledger"
                    className="text-sm tracking-wide uppercase text-background/40 hover:text-background/70 transition-colors border-b border-transparent hover:border-background/20 pb-0.5 w-fit"
                  >
                    View the ledger
                  </a>
                )}
              </div>
            </Reveal>
          </div>

          {/* Bottom stat strip */}
          <div className="mt-20 pt-10 border-t border-background/10 grid grid-cols-2 md:grid-cols-4 gap-8">
            {[
              { label: "Net profit tracked", value: fmt(totalRevenue) },
              { label: "Committed to impact", value: fmt(totalCommitted) },
              { label: "Disbursed to date", value: fmt(totalDisbursed) },
              { label: "Months of giving", value: entries.length > 0 ? String(entries.length) : "—" },
            ].map(({ label, value }) => (
              <div key={label}>
                <div className="font-display text-2xl font-light text-background mb-1">{value}</div>
                <div className="text-[10px] tracking-[0.15em] uppercase text-background/35">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
