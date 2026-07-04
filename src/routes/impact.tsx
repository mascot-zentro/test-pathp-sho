import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Heart, ExternalLink, Download, Loader2, CheckCircle2,
  ArrowRight, Sparkles, TrendingUp, Calendar, Users, Banknote,
  Quote, Send, ChevronDown,
} from "lucide-react";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { Reveal } from "@/components/reveal";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/impact")({
  head: () => ({
    meta: [
      { title: "Aavira Impact Fund — Fashion that creates change" },
      {
        name: "description",
        content:
          "Every Aavira purchase contributes a percentage to the Aavira Impact Fund — funding real projects that uplift women and communities across Nepal. Full transparency, monthly ledger.",
      },
      { property: "og:title", content: "Aavira Impact Fund" },
      {
        property: "og:description",
        content:
          "5% of every Aavira sale funds real community impact across Nepal. See the ledger, projects, and stories.",
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
  id: string;
  month: number;
  year: number;
  total_revenue: number;
  contribution_amount: number | null;
  status: "accrued" | "disbursed";
  notes: string | null;
};

type Project = {
  id: string;
  title: string;
  description: string | null;
  cover_image: string | null;
  status: "planned" | "ongoing" | "completed";
  partner_org_name: string | null;
  partner_org_url: string | null;
  display_order: number;
};

type Disbursement = {
  id: string;
  amount: number;
  disbursed_date: string;
  receipt_url: string | null;
  notes: string | null;
  project_id: string | null;
};

type Update = {
  id: string;
  title: string;
  body: string | null;
  images: string[] | null;
  linked_project_id: string | null;
  published_at: string;
  is_featured: boolean;
};

type Testimonial = {
  id: string;
  beneficiary_name: string | null;
  photo: string | null;
  quote: string;
  linked_project_id: string | null;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function fmt(n: number) {
  return new Intl.NumberFormat("en-NP", {
    style: "currency",
    currency: "NPR",
    maximumFractionDigits: 0,
  }).format(n);
}

function downloadCSV(entries: FundEntry[]) {
  const rows = [
    ["Month", "Year", "Revenue (NPR)", "Contribution (NPR)", "Status", "Notes"],
    ...entries.map((e) => [
      MONTHS[e.month - 1], e.year, e.total_revenue,
      e.contribution_amount ?? "", e.status, e.notes ?? "",
    ]),
  ];
  const csv = rows
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "aavira-impact-ledger.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Animated counter ────────────────────────────────────────────────────────

function AnimatedCounter({
  target,
  prefix = "",
  suffix = "",
  duration = 1800,
}: {
  target: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
}) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          const start = performance.now();
          const tick = (now: number) => {
            const elapsed = now - start;
            const progress = Math.min(elapsed / duration, 1);
            const ease = 1 - Math.pow(1 - progress, 3);
            setDisplay(Math.round(ease * target));
            if (progress < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }
      },
      { threshold: 0.3 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [target, duration]);

  return (
    <span ref={ref}>
      {prefix}
      {display.toLocaleString("en-NP")}
      {suffix}
    </span>
  );
}

// ─── Status pill ─────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    accrued: "bg-amber-50 text-amber-700 border-amber-200 ring-amber-100",
    disbursed: "bg-emerald-50 text-emerald-700 border-emerald-200 ring-emerald-100",
    planned: "bg-muted text-muted-foreground border-border",
    ongoing: "bg-accent/8 text-accent border-accent/20",
    completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  };
  const dot: Record<string, string> = {
    accrued: "bg-amber-400",
    disbursed: "bg-emerald-500",
    planned: "bg-muted-foreground/40",
    ongoing: "bg-accent animate-pulse",
    completed: "bg-emerald-500",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium tracking-wide",
        map[status] ?? "bg-muted text-muted-foreground border-border",
      )}
    >
      <span className={cn("size-1.5 rounded-full", dot[status] ?? "bg-muted-foreground")} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

// ─── Section header ──────────────────────────────────────────────────────────

function SectionHeader({
  eyebrow,
  title,
  subtitle,
  center = false,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  center?: boolean;
}) {
  return (
    <Reveal className={cn("mb-14", center && "text-center")}>
      <div
        className={cn(
          "inline-flex items-center gap-2 mb-4",
          center && "justify-center w-full",
        )}
      >
        <span className="h-px w-8 bg-accent/40" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.28em] text-accent">
          {eyebrow}
        </span>
        <span className="h-px w-8 bg-accent/40" />
      </div>
      <h2
        className={cn(
          "font-display text-3xl md:text-4xl lg:text-5xl font-light leading-tight",
          center && "mx-auto",
        )}
      >
        {title}
      </h2>
      {subtitle && (
        <p
          className={cn(
            "mt-4 text-muted-foreground text-base md:text-lg font-light leading-relaxed max-w-xl",
            center && "mx-auto",
          )}
        >
          {subtitle}
        </p>
      )}
    </Reveal>
  );
}

// ─── Suggest a Cause Form ────────────────────────────────────────────────────

function SuggestForm() {
  const [form, setForm] = useState({ name: "", email: "", suggestion: "" });
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.suggestion.trim()) return;
    setLoading(true);
    const db = supabase as any;
    await db.from("impact_cause_suggestions").insert({
      name: form.name || null,
      email: form.email || null,
      suggestion: form.suggestion,
    });
    setLoading(false);
    setDone(true);
  };

  if (done) {
    return (
      <div className="flex flex-col items-center gap-5 py-16 text-center">
        <div className="size-16 rounded-full bg-emerald-50 border border-emerald-100 grid place-items-center animate-bounce-once">
          <CheckCircle2 className="size-8 text-emerald-600" />
        </div>
        <div>
          <p className="font-display text-2xl text-foreground mb-1">Thank you</p>
          <p className="text-sm text-muted-foreground max-w-sm">
            We review every suggestion as we plan future impact initiatives.
          </p>
        </div>
        <button
          onClick={() => { setDone(false); setForm({ name: "", email: "", suggestion: "" }); }}
          className="text-sm text-accent hover:underline underline-offset-4 transition-all"
        >
          Submit another suggestion →
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5 max-w-xl mx-auto">
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="sg-name" className="text-sm font-medium">
            Your name <span className="text-muted-foreground font-normal">(optional)</span>
          </Label>
          <Input
            id="sg-name"
            placeholder="Asha Tamang"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="transition-shadow focus:shadow-[0_0_0_3px_oklch(0.62_0.14_358/0.12)]"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="sg-email" className="text-sm font-medium">
            Email <span className="text-muted-foreground font-normal">(optional)</span>
          </Label>
          <Input
            id="sg-email"
            type="email"
            placeholder="asha@example.com"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            className="transition-shadow focus:shadow-[0_0_0_3px_oklch(0.62_0.14_358/0.12)]"
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="sg-suggestion" className="text-sm font-medium">
          Your suggestion <span className="text-accent">*</span>
        </Label>
        <Textarea
          id="sg-suggestion"
          placeholder="Tell us about a cause or community you'd like us to support…"
          rows={5}
          value={form.suggestion}
          onChange={(e) => setForm((f) => ({ ...f, suggestion: e.target.value }))}
          required
          className="resize-none transition-shadow focus:shadow-[0_0_0_3px_oklch(0.62_0.14_358/0.12)]"
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="group inline-flex items-center gap-2.5 px-8 py-3.5 rounded-full bg-foreground text-background text-sm font-medium tracking-wide transition-all duration-300 hover:bg-accent hover:shadow-[0_8px_40px_oklch(0.62_0.14_358/0.3)] hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60 disabled:pointer-events-none"
      >
        {loading ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Send className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
        )}
        Submit suggestion
      </button>
    </form>
  );
}

// ─── Project card ─────────────────────────────────────────────────────────────

function ProjectCard({ p, index }: { p: Project; index: number }) {
  return (
    <Reveal delay={index * 80}>
      <article className="group rounded-3xl border border-border/50 bg-card overflow-hidden hover:border-accent/30 hover:shadow-xl hover:shadow-accent/5 transition-all duration-500 h-full flex flex-col">
        {p.cover_image ? (
          <div className="aspect-[4/3] overflow-hidden bg-muted relative">
            <img
              src={p.cover_image}
              alt={p.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-linear-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          </div>
        ) : (
          <div className="aspect-[4/3] bg-linear-to-br from-accent/8 via-accent/4 to-background grid place-items-center relative overflow-hidden">
            <div className="absolute inset-0 grain opacity-30" />
            <Heart className="size-10 text-accent/25" />
          </div>
        )}
        <div className="p-6 space-y-3 flex-1 flex flex-col">
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-display font-medium text-foreground leading-snug text-lg">{p.title}</h3>
            <StatusPill status={p.status} />
          </div>
          {p.description && (
            <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3 flex-1">
              {p.description}
            </p>
          )}
          {p.partner_org_name && (
            <div className="text-xs text-muted-foreground pt-2 flex items-center gap-1.5 mt-auto">
              <Users className="size-3 shrink-0" />
              <span>Partner: </span>
              {p.partner_org_url ? (
                <a
                  href={p.partner_org_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:underline underline-offset-4 inline-flex items-center gap-0.5 font-medium"
                >
                  {p.partner_org_name} <ExternalLink className="size-3" />
                </a>
              ) : (
                <span className="font-medium text-foreground">{p.partner_org_name}</span>
              )}
            </div>
          )}
        </div>
      </article>
    </Reveal>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

function ImpactPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [entries, setEntries] = useState<FundEntry[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [disbursements, setDisbursements] = useState<Disbursement[]>([]);
  const [updates, setUpdates] = useState<Update[]>([]);
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [loading, setLoading] = useState(true);
  const heroRef = useRef<HTMLElement>(null);
  const blobRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const db = supabase as any;
    Promise.all([
      db.from("impact_settings").select("*").limit(1).single(),
      db.from("impact_fund_entries").select("*").order("year", { ascending: false }).order("month", { ascending: false }),
      db.from("impact_projects").select("*").eq("is_published", true).order("display_order"),
      db.from("impact_disbursements").select("*").order("disbursed_date", { ascending: false }),
      db.from("impact_updates").select("*").not("published_at", "is", null).order("is_featured", { ascending: false }).order("published_at", { ascending: false }),
      db.from("impact_testimonials").select("*").eq("is_published", true),
    ]).then(([s, e, p, d, u, t]) => {
      if (s.data) setSettings(s.data);
      if (e.data) setEntries(e.data);
      if (p.data) setProjects(p.data);
      if (d.data) setDisbursements(d.data);
      if (u.data) setUpdates(u.data);
      if (t.data) setTestimonials(t.data);
      setLoading(false);
    });
  }, []);

  // Subtle mouse-parallax on hero blobs
  useEffect(() => {
    const hero = heroRef.current;
    const blob = blobRef.current;
    if (!hero || !blob) return;
    const onMove = (e: MouseEvent) => {
      const { left, top, width, height } = hero.getBoundingClientRect();
      const x = ((e.clientX - left) / width - 0.5) * 24;
      const y = ((e.clientY - top) / height - 0.5) * 16;
      blob.style.transform = `translate(${x}px, ${y}px)`;
    };
    hero.addEventListener("mousemove", onMove);
    return () => hero.removeEventListener("mousemove", onMove);
  }, [loading]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="relative size-14">
            <div className="absolute inset-0 rounded-full border-2 border-accent/20 animate-ping" />
            <div className="absolute inset-2 rounded-full bg-accent/10 grid place-items-center">
              <Heart className="size-5 text-accent animate-pulse" fill="currentColor" />
            </div>
          </div>
          <p className="text-sm text-muted-foreground animate-pulse">Loading impact data…</p>
        </div>
      </div>
    );
  }

  if (settings && settings.is_page_public === false) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-5 bg-background">
        <div className="size-16 rounded-full bg-muted grid place-items-center">
          <Heart className="size-7 text-muted-foreground" />
        </div>
        <div className="text-center">
          <p className="font-display text-3xl text-foreground mb-2">Coming soon</p>
          <p className="text-muted-foreground">The Aavira Impact page is not yet public.</p>
        </div>
      </div>
    );
  }

  const totalCommitted = entries.reduce(
    (acc, e) => acc + (e.contribution_amount ?? (e.total_revenue * (settings?.contribution_percentage ?? 5) / 100)),
    0,
  );
  const totalDisbursed = disbursements.reduce((acc, d) => acc + d.amount, 0);
  const monthsActive = entries.length;
  const lastEntry = entries[0];
  const lastEntryDate = lastEntry ? `${MONTHS[lastEntry.month - 1]} ${lastEntry.year}` : "—";
  const fundName = settings?.fund_display_name ?? "Aavira Impact Fund";
  const pct = settings?.contribution_percentage ?? 5;
  const totalRevenue = entries.reduce((acc, e) => acc + e.total_revenue, 0);

  const stats = [
    { label: "Total committed", value: fmt(totalCommitted), icon: TrendingUp, raw: totalCommitted },
    { label: "Total disbursed", value: fmt(totalDisbursed), icon: Banknote, raw: totalDisbursed },
    { label: "Months active", value: monthsActive > 0 ? String(monthsActive) : "—", icon: Calendar, raw: monthsActive },
    { label: "Last recorded", value: lastEntryDate, icon: Heart, raw: null },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <SiteNav />

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section ref={heroRef} className="relative overflow-hidden grain min-h-[92vh] flex items-center">
        {/* Background layers */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-linear-to-br from-[oklch(0.96_0.020_358)] via-[oklch(0.975_0.008_30)] to-[oklch(0.97_0.014_60)]" />
        </div>
        {/* Animated blobs */}
        <div
          ref={blobRef}
          className="absolute inset-0 -z-10 pointer-events-none transition-transform duration-500 ease-out"
        >
          <div className="absolute top-[-10%] left-[-5%] w-[600px] h-[600px] rounded-full bg-[oklch(0.88_0.055_358/0.22)] blur-[160px]" />
          <div className="absolute bottom-[-15%] right-[-8%] w-[500px] h-[500px] rounded-full bg-[oklch(0.90_0.04_45/0.18)] blur-[140px]" />
          <div className="absolute top-[40%] left-[60%] w-[300px] h-[300px] rounded-full bg-[oklch(0.93_0.03_280/0.12)] blur-[100px]" />
        </div>

        <div className="container mx-auto px-6 py-28 md:py-36 max-w-5xl w-full">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            {/* Left — copy */}
            <div>
              <Reveal>
                <div className="inline-flex items-center gap-2 mb-7 px-4 py-2 rounded-full bg-accent/10 border border-accent/20 backdrop-blur-sm">
                  <Heart className="size-3.5 text-accent" fill="currentColor" />
                  <span className="text-xs font-semibold tracking-[0.2em] uppercase text-accent">{fundName}</span>
                </div>
              </Reveal>
              <Reveal delay={70}>
                <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl font-light leading-[0.95] tracking-tight mb-7">
                  Fashion<br />
                  that <span className="text-accent italic">creates</span><br />
                  change
                </h1>
              </Reveal>
              <Reveal delay={140}>
                <p className="text-lg text-muted-foreground leading-relaxed font-light mb-8 max-w-md">
                  {pct}% of every Aavira sale flows directly into the {fundName} — funding real projects that uplift women and communities across Nepal.
                </p>
              </Reveal>
              <Reveal delay={200}>
                <div className="flex flex-wrap gap-3">
                  <Link
                    to="/"
                    className="group inline-flex items-center gap-2 px-7 py-3.5 rounded-full bg-foreground text-background text-sm font-medium tracking-wide transition-all duration-300 hover:bg-accent hover:shadow-[0_8px_40px_oklch(0.62_0.14_358/0.35)] hover:scale-[1.02] active:scale-[0.98]"
                  >
                    Shop & create impact
                    <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                  </Link>
                  <a
                    href="#ledger"
                    className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full border border-border/60 text-sm font-medium text-muted-foreground hover:text-foreground hover:border-border transition-all duration-200 backdrop-blur-sm"
                  >
                    See the ledger
                  </a>
                </div>
              </Reveal>
              {settings?.excluded_costs_note && (
                <Reveal delay={250}>
                  <p className="mt-7 text-xs text-muted-foreground/70 max-w-sm leading-relaxed border-l-2 border-accent/20 pl-3">
                    {settings.excluded_costs_note}
                  </p>
                </Reveal>
              )}
            </div>

            {/* Right — formula card + pulse ring */}
            <Reveal delay={160} direction="left">
              <div className="flex flex-col gap-5">
                <div className="bg-card/80 backdrop-blur-sm border border-border/50 rounded-3xl p-8 shadow-xl shadow-black/5">
                  <p className="text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground mb-6">How it works</p>
                  <div className="space-y-4">
                    {[
                      { step: "01", label: "You place an order", desc: "Every Aavira purchase is processed normally." },
                      { step: "02", label: `${pct}% is ring-fenced`, desc: "That fraction is automatically allocated to the impact fund." },
                      { step: "03", label: "Real change happens", desc: "Funds flow to vetted projects, tracked publicly here." },
                    ].map(({ step, label, desc }) => (
                      <div key={step} className="flex gap-4 items-start">
                        <span className="text-[11px] font-mono font-semibold text-accent/60 mt-0.5 shrink-0 w-5">{step}</span>
                        <div>
                          <p className="font-medium text-sm text-foreground">{label}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="bg-linear-to-r from-accent/8 to-accent/4 border border-accent/20 rounded-2xl px-6 py-4 flex items-center gap-4">
                  <div className="relative shrink-0">
                    <div className="size-10 rounded-full bg-accent/15 grid place-items-center">
                      <Heart className="size-4 text-accent" fill="currentColor" />
                    </div>
                    <div className="absolute inset-0 rounded-full border border-accent/30 animate-ping" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {fmt(totalRevenue)} total net profit tracked
                    </p>
                    <p className="text-xs text-muted-foreground">Full transparency — every rupee is accounted for</p>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>

          {/* Scroll cue */}
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 opacity-40">
            <span className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Scroll</span>
            <ChevronDown className="size-4 text-muted-foreground animate-bounce" />
          </div>
        </div>
      </section>

      {/* ── STATS BAR ────────────────────────────────────────────────────── */}
      <section className="border-y border-border/40 bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-6 max-w-5xl">
          <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 divide-border/40">
            {stats.map(({ label, value, icon: Icon, raw }, i) => (
              <Reveal key={label} delay={i * 60}>
                <div className="px-8 py-10 text-center group">
                  <div className="flex justify-center mb-3">
                    <div className="size-9 rounded-full bg-accent/8 grid place-items-center group-hover:bg-accent/15 transition-colors duration-300">
                      <Icon className="size-4 text-accent" />
                    </div>
                  </div>
                  <div className="font-display text-2xl md:text-3xl font-light text-foreground mb-1.5 tabular-nums">
                    {raw !== null && typeof raw === "number" && raw > 1000
                      ? label === "Months active"
                        ? <AnimatedCounter target={raw} />
                        : value
                      : value}
                  </div>
                  <div className="text-xs text-muted-foreground tracking-wide uppercase">{label}</div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── LEDGER ───────────────────────────────────────────────────────── */}
      {settings?.is_public_ledger_visible && entries.length > 0 && (
        <section id="ledger" className="border-b border-border/40">
          <div className="container mx-auto px-6 py-24 max-w-5xl">
            <div className="flex items-end justify-between mb-14 flex-wrap gap-4">
              <SectionHeader
                eyebrow="Full transparency"
                title="Monthly Ledger"
                subtitle="Every rupee, every month — publicly verifiable."
              />
              <Reveal delay={60}>
                <button
                  onClick={() => downloadCSV(entries)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-border/60 text-sm text-muted-foreground hover:text-foreground hover:border-border hover:bg-muted/30 transition-all duration-200 shrink-0"
                >
                  <Download className="size-3.5" /> Download CSV
                </button>
              </Reveal>
            </div>

            <Reveal delay={80}>
              <div className="rounded-3xl border border-border/50 overflow-hidden shadow-sm">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/40 bg-muted/40">
                      <th className="text-left px-6 py-4 font-semibold text-muted-foreground text-[11px] uppercase tracking-[0.15em]">Period</th>
                      <th className="text-right px-6 py-4 font-semibold text-muted-foreground text-[11px] uppercase tracking-[0.15em]">Revenue</th>
                      <th className="text-right px-6 py-4 font-semibold text-muted-foreground text-[11px] uppercase tracking-[0.15em]">Contribution</th>
                      <th className="text-left px-6 py-4 font-semibold text-muted-foreground text-[11px] uppercase tracking-[0.15em]">Status</th>
                      <th className="text-left px-6 py-4 font-semibold text-muted-foreground text-[11px] uppercase tracking-[0.15em] hidden md:table-cell">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((e, i) => (
                      <tr
                        key={e.id}
                        className={cn(
                          "border-b border-border/30 last:border-0 hover:bg-accent/3 transition-colors duration-150",
                          i % 2 === 1 && "bg-muted/20",
                        )}
                      >
                        <td className="px-6 py-4 font-medium text-foreground">
                          {MONTHS[e.month - 1]} {e.year}
                        </td>
                        <td className="px-6 py-4 text-right text-muted-foreground">{fmt(e.total_revenue)}</td>
                        <td className="px-6 py-4 text-right font-semibold text-accent">
                          {e.contribution_amount != null
                            ? fmt(e.contribution_amount)
                            : fmt(e.total_revenue * pct / 100)}
                        </td>
                        <td className="px-6 py-4"><StatusPill status={e.status} /></td>
                        <td className="px-6 py-4 text-muted-foreground text-xs hidden md:table-cell max-w-[200px] truncate">
                          {e.notes ?? <span className="text-border">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Reveal>
          </div>
        </section>
      )}

      {/* ── PROJECTS ─────────────────────────────────────────────────────── */}
      {projects.length > 0 && (
        <section className="border-b border-border/40 bg-[oklch(0.975_0.006_358/0.5)]">
          <div className="container mx-auto px-6 py-24 max-w-5xl">
            <SectionHeader
              eyebrow="What we fund"
              title="Impact Projects"
              subtitle="Every project is hand-selected, vetted, and tracked through to completion."
            />
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {projects.map((p, i) => (
                <ProjectCard key={p.id} p={p} index={i} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── DISBURSEMENTS ────────────────────────────────────────────────── */}
      {disbursements.length > 0 && (
        <section className="border-b border-border/40">
          <div className="container mx-auto px-6 py-24 max-w-5xl">
            <SectionHeader
              eyebrow="Where the money goes"
              title="Disbursements"
              subtitle="Every transfer is documented with a date and, where possible, a receipt."
            />
            <div className="space-y-4">
              {disbursements.map((d, i) => (
                <Reveal key={d.id} delay={i * 50}>
                  <div className="group flex items-start gap-5 bg-card border border-border/50 rounded-2xl px-7 py-6 hover:border-emerald-200 hover:shadow-md hover:shadow-emerald-500/5 transition-all duration-300">
                    <div className="size-11 rounded-full bg-emerald-50 border border-emerald-100 grid place-items-center shrink-0 mt-0.5 group-hover:bg-emerald-100 transition-colors duration-200">
                      <CheckCircle2 className="size-5 text-emerald-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 flex-wrap mb-1">
                        <span className="font-display font-medium text-xl text-foreground">{fmt(d.amount)}</span>
                        <span className="text-xs bg-muted/60 text-muted-foreground px-2.5 py-1 rounded-full">
                          {new Date(d.disbursed_date).toLocaleDateString("en-NP", {
                            year: "numeric", month: "long", day: "numeric",
                          })}
                        </span>
                        {d.receipt_url && (
                          <a
                            href={d.receipt_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-accent hover:underline underline-offset-4 inline-flex items-center gap-1 font-medium"
                          >
                            View receipt <ExternalLink className="size-3" />
                          </a>
                        )}
                      </div>
                      {d.notes && (
                        <p className="text-sm text-muted-foreground leading-relaxed">{d.notes}</p>
                      )}
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── STORIES & UPDATES ────────────────────────────────────────────── */}
      {updates.length > 0 && (
        <section className="border-b border-border/40 bg-[oklch(0.975_0.006_358/0.5)]">
          <div className="container mx-auto px-6 py-24 max-w-5xl">
            <SectionHeader
              eyebrow="From the field"
              title="Stories & Updates"
              subtitle="Real stories from the communities we support."
            />
            <div className="grid sm:grid-cols-2 gap-6">
              {updates.map((u, i) => (
                <Reveal key={u.id} delay={i * 70}>
                  <article
                    className={cn(
                      "group rounded-3xl border overflow-hidden bg-card hover:shadow-xl transition-all duration-500 h-full flex flex-col",
                      u.is_featured
                        ? "border-accent/30 ring-1 ring-accent/15 hover:ring-accent/30"
                        : "border-border/50 hover:border-accent/20",
                    )}
                  >
                    {u.images && u.images.length > 0 && (
                      <div
                        className={cn(
                          "grid overflow-hidden aspect-video bg-muted",
                          u.images.length === 1 ? "grid-cols-1" : "grid-cols-2",
                        )}
                      >
                        {u.images.slice(0, 4).map((img, idx) => (
                          <img
                            key={idx}
                            src={img}
                            alt=""
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                            loading="lazy"
                          />
                        ))}
                      </div>
                    )}
                    <div className="p-6 space-y-3 flex-1 flex flex-col">
                      {u.is_featured && (
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-accent bg-accent/8 rounded-full px-3 py-1 w-fit border border-accent/20">
                          <Sparkles className="size-3" /> Featured story
                        </span>
                      )}
                      <h3 className="font-display font-medium text-foreground leading-snug text-lg">{u.title}</h3>
                      {u.body && (
                        <p className="text-sm text-muted-foreground leading-relaxed line-clamp-4 flex-1">{u.body}</p>
                      )}
                      <time
                        dateTime={u.published_at}
                        className="text-xs text-muted-foreground/60 mt-auto"
                      >
                        {new Date(u.published_at).toLocaleDateString("en-NP", {
                          year: "numeric", month: "long", day: "numeric",
                        })}
                      </time>
                    </div>
                  </article>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── TESTIMONIALS ─────────────────────────────────────────────────── */}
      {testimonials.length > 0 && (
        <section className="border-b border-border/40">
          <div className="container mx-auto px-6 py-24 max-w-5xl">
            <SectionHeader
              eyebrow="Their words"
              title="Voices from the ground"
              center
            />
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {testimonials.map((t, i) => (
                <Reveal key={t.id} delay={i * 70}>
                  <figure className="bg-card border border-border/50 rounded-3xl p-7 space-y-5 hover:border-accent/25 hover:shadow-lg hover:shadow-accent/4 transition-all duration-300 h-full flex flex-col">
                    <Quote className="size-6 text-accent/30 shrink-0" />
                    <blockquote className="text-foreground/80 leading-relaxed text-sm flex-1">
                      {t.quote}
                    </blockquote>
                    <figcaption className="flex items-center gap-3 pt-4 border-t border-border/40">
                      {t.photo ? (
                        <img
                          src={t.photo}
                          alt={t.beneficiary_name ?? ""}
                          className="size-10 rounded-full object-cover border border-border/40 shrink-0"
                          loading="lazy"
                        />
                      ) : (
                        <div className="size-10 rounded-full bg-accent/10 grid place-items-center shrink-0 border border-accent/15">
                          <span className="text-accent font-semibold text-sm">
                            {t.beneficiary_name?.[0]?.toUpperCase() ?? "?"}
                          </span>
                        </div>
                      )}
                      <span className="font-medium text-sm text-foreground">
                        {t.beneficiary_name ?? "Anonymous"}
                      </span>
                    </figcaption>
                  </figure>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── SUGGEST A CAUSE ──────────────────────────────────────────────── */}
      <section className="border-b border-border/40 bg-[oklch(0.975_0.006_358/0.5)]">
        <div className="container mx-auto px-6 py-24 max-w-5xl">
          <SectionHeader
            eyebrow="Have an idea?"
            title="Suggest a cause"
            subtitle="Know a community or cause that deserves support? Tell us — we consider every suggestion when planning future initiatives."
            center
          />
          <Reveal delay={80}>
            <SuggestForm />
          </Reveal>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[oklch(0.12_0.014_40)]" />
        <div className="absolute inset-0 grain opacity-40" />
        <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-[oklch(0.62_0.14_358/0.12)] blur-[180px]" />
        <div className="absolute bottom-[-20%] right-[-5%] w-[400px] h-[400px] rounded-full bg-[oklch(0.55_0.12_30/0.1)] blur-[150px]" />
        <div className="relative container mx-auto px-6 py-28 max-w-3xl text-center">
          <Reveal>
            <div className="inline-flex size-16 rounded-full bg-accent/15 items-center justify-center mx-auto mb-8 ring-1 ring-accent/20">
              <Heart className="size-7 text-accent" fill="currentColor" />
            </div>
            <h2 className="font-display text-4xl md:text-5xl lg:text-6xl font-light text-[oklch(0.97_0.006_30)] leading-tight mb-6">
              Every purchase<br />
              <span className="text-accent italic">matters</span>
            </h2>
            <p className="text-[oklch(0.97_0.006_30/0.55)] mb-10 max-w-md mx-auto font-light leading-relaxed text-lg">
              When you shop at Aavira, {pct}% of your order goes straight into the {fundName} — no middlemen, full transparency.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                to="/"
                className="group inline-flex items-center justify-center gap-2 px-9 py-4 rounded-full bg-accent text-white text-sm font-semibold tracking-wide transition-all duration-300 hover:bg-accent/90 hover:shadow-[0_8px_48px_oklch(0.62_0.14_358/0.45)] hover:scale-[1.02] active:scale-[0.98]"
              >
                Shop & create impact
                <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
              </Link>
              <a
                href="#ledger"
                className="inline-flex items-center justify-center gap-2 px-9 py-4 rounded-full border border-white/15 text-[oklch(0.97_0.006_30/0.7)] text-sm font-medium tracking-wide transition-all duration-200 hover:border-white/30 hover:text-white"
              >
                View the ledger
              </a>
            </div>
          </Reveal>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
