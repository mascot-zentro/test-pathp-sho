import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Heart, ExternalLink, Download, Loader2, CheckCircle2, ArrowRight, Sparkles } from "lucide-react";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { Reveal } from "@/components/reveal";

export const Route = createFileRoute("/impact")({
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
  return new Intl.NumberFormat("en-NP", { style: "currency", currency: "NPR", maximumFractionDigits: 0 }).format(n);
}

// ─── Ledger CSV download ──────────────────────────────────────────────────────

function downloadCSV(entries: FundEntry[]) {
  const rows = [
    ["Month", "Year", "Revenue (NPR)", "Contribution (NPR)", "Status", "Notes"],
    ...entries.map((e) => [
      MONTHS[e.month - 1], e.year, e.total_revenue,
      e.contribution_amount ?? "", e.status, e.notes ?? "",
    ]),
  ];
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "aavira-impact-ledger.csv"; a.click();
  URL.revokeObjectURL(url);
}

// ─── Status pill ─────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    accrued: "bg-amber-100 text-amber-800 border-amber-200",
    disbursed: "bg-emerald-100 text-emerald-800 border-emerald-200",
    planned: "bg-muted text-muted-foreground border-border",
    ongoing: "bg-accent/10 text-accent border-accent/20",
    completed: "bg-emerald-100 text-emerald-800 border-emerald-200",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium tracking-wide ${map[status] ?? "bg-muted text-muted-foreground border-border"}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
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
      <div className="flex flex-col items-center gap-4 py-12 text-center">
        <div className="size-14 rounded-full bg-accent/10 grid place-items-center">
          <CheckCircle2 className="size-7 text-accent" />
        </div>
        <p className="font-display text-xl text-foreground">Thank you for your suggestion</p>
        <p className="text-sm text-muted-foreground max-w-sm">We review all suggestions as we plan future impact initiatives.</p>
        <button
          onClick={() => { setDone(false); setForm({ name: "", email: "", suggestion: "" }); }}
          className="text-sm text-accent hover:underline underline-offset-4 mt-1"
        >
          Submit another →
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5 max-w-lg mx-auto">
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="sg-name" className="text-sm font-medium">Your name <span className="text-muted-foreground font-normal">(optional)</span></Label>
          <Input id="sg-name" placeholder="Asha Tamang" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sg-email" className="text-sm font-medium">Email <span className="text-muted-foreground font-normal">(optional)</span></Label>
          <Input id="sg-email" type="email" placeholder="asha@example.com" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="sg-suggestion" className="text-sm font-medium">Your suggestion <span className="text-accent">*</span></Label>
        <Textarea
          id="sg-suggestion"
          placeholder="Tell us about a cause or community you'd like us to support…"
          rows={4}
          value={form.suggestion}
          onChange={(e) => setForm((f) => ({ ...f, suggestion: e.target.value }))}
          required
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="group inline-flex items-center gap-2 px-8 py-3.5 rounded-full bg-foreground text-background text-sm font-medium tracking-wide transition-all duration-300 hover:bg-accent hover:shadow-[0_8px_40px_oklch(0.62_0.14_358/0.3)] disabled:opacity-60"
      >
        {loading ? <Loader2 className="size-4 animate-spin" /> : <Heart className="size-4" />}
        Submit suggestion
      </button>
    </form>
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="size-7 animate-spin text-accent" />
      </div>
    );
  }

  if (settings && settings.is_page_public === false) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 bg-background text-muted-foreground">
        <p className="font-display text-2xl text-foreground">Coming soon</p>
        <p className="text-sm">The Aavira Impact page is not yet public.</p>
      </div>
    );
  }

  const totalCommitted = entries.reduce((acc, e) => acc + (e.contribution_amount ?? (e.total_revenue * (settings?.contribution_percentage ?? 5) / 100)), 0);
  const totalDisbursed = disbursements.reduce((acc, d) => acc + d.amount, 0);
  const monthsActive = entries.length;
  const lastEntry = entries[0];
  const lastEntryDate = lastEntry ? `${MONTHS[lastEntry.month - 1]} ${lastEntry.year}` : "—";
  const fundName = settings?.fund_display_name ?? "Aavira Impact Fund";
  const pct = settings?.contribution_percentage ?? 5;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <SiteNav />

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden grain">
        <div className="absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-linear-to-br from-[oklch(0.96_0.018_358)] via-background to-[oklch(0.97_0.012_60)]" />
          <div className="absolute top-0 left-0 w-175 h-175 rounded-full bg-[oklch(0.88_0.05_358/0.25)] blur-[140px] -translate-x-1/3 -translate-y-1/3" />
          <div className="absolute bottom-0 right-0 w-125 h-125 rounded-full bg-[oklch(0.90_0.04_45/0.2)] blur-[120px] translate-x-1/4 translate-y-1/4" />
        </div>
        <div className="container mx-auto px-6 py-24 md:py-36 text-center max-w-4xl">
          <Reveal>
            <div className="inline-flex items-center gap-2 mb-8 px-4 py-2 rounded-full bg-accent/10 border border-accent/20">
              <Heart className="size-3.5 text-accent" fill="currentColor" />
              <span className="text-xs font-medium tracking-[0.18em] uppercase text-accent">{fundName}</span>
            </div>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="font-display text-5xl sm:text-6xl md:text-7xl font-light leading-none tracking-tight mb-8">
              Fashion that<br />
              <span className="text-accent">creates change</span>
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed font-light">
              {pct}% of every Aavira sale goes directly to the {fundName} — funding real projects that uplift women and communities across Nepal.
            </p>
          </Reveal>
          <Reveal delay={220}>
            <div className="inline-flex items-center gap-4 bg-card border border-border/60 rounded-2xl px-8 py-5 text-sm shadow-sm">
              <span className="text-muted-foreground">Every order</span>
              <span className="text-border">×</span>
              <span className="font-semibold text-accent">{pct}%</span>
              <span className="text-border">=</span>
              <span className="font-semibold text-foreground">Real impact</span>
            </div>
          </Reveal>
          {settings?.excluded_costs_note && (
            <Reveal delay={260}>
              <p className="mt-6 text-sm text-muted-foreground max-w-lg mx-auto">
                <strong>Note:</strong> {settings.excluded_costs_note}
              </p>
            </Reveal>
          )}
        </div>
      </section>

      {/* ── STATS ────────────────────────────────────────────────────────── */}
      <section className="border-t border-border/40 bg-card/60">
        <div className="container mx-auto px-6 py-16 max-w-5xl">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border/40 rounded-2xl overflow-hidden border border-border/40">
            {[
              { label: "Total committed", value: fmt(totalCommitted) },
              { label: "Total disbursed", value: fmt(totalDisbursed) },
              { label: "Months active", value: monthsActive > 0 ? String(monthsActive) : "—" },
              { label: "Last recorded", value: lastEntryDate },
            ].map((s) => (
              <div key={s.label} className="bg-card px-6 py-8 text-center">
                <div className="font-display text-2xl md:text-3xl font-light text-accent mb-1.5">{s.value}</div>
                <div className="text-xs text-muted-foreground tracking-wide uppercase">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── LEDGER ───────────────────────────────────────────────────────── */}
      {settings?.is_public_ledger_visible && entries.length > 0 && (
        <section className="border-t border-border/40">
          <div className="container mx-auto px-6 py-20 max-w-5xl">
            <Reveal className="flex items-end justify-between mb-10 flex-wrap gap-4">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-[0.3em] text-accent mb-2">Full transparency</p>
                <h2 className="font-display text-3xl md:text-4xl font-light">Monthly Ledger</h2>
              </div>
              <button
                onClick={() => downloadCSV(entries)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-border/60 text-sm text-muted-foreground hover:text-foreground hover:border-border transition-all duration-200"
              >
                <Download className="size-3.5" /> Download CSV
              </button>
            </Reveal>
            <Reveal delay={60}>
              <div className="rounded-2xl border border-border/60 overflow-hidden bg-card">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/40 bg-muted/30">
                      <th className="text-left px-5 py-3.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">Period</th>
                      <th className="text-right px-5 py-3.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">Revenue</th>
                      <th className="text-right px-5 py-3.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">Contribution</th>
                      <th className="text-left px-5 py-3.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">Status</th>
                      <th className="text-left px-5 py-3.5 font-medium text-muted-foreground text-xs uppercase tracking-wide hidden sm:table-cell">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((e, i) => (
                      <tr key={e.id} className={`border-b border-border/30 last:border-0 transition-colors hover:bg-muted/20 ${i % 2 === 0 ? "" : "bg-muted/10"}`}>
                        <td className="px-5 py-3.5 font-medium">{MONTHS[e.month - 1]} {e.year}</td>
                        <td className="px-5 py-3.5 text-right text-muted-foreground">{fmt(e.total_revenue)}</td>
                        <td className="px-5 py-3.5 text-right font-semibold text-accent">
                          {e.contribution_amount != null ? fmt(e.contribution_amount) : fmt(e.total_revenue * pct / 100)}
                        </td>
                        <td className="px-5 py-3.5"><StatusPill status={e.status} /></td>
                        <td className="px-5 py-3.5 text-muted-foreground text-xs hidden sm:table-cell">{e.notes ?? "—"}</td>
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
        <section className="border-t border-border/40">
          <div className="container mx-auto px-6 py-20 max-w-5xl">
            <Reveal className="mb-12">
              <p className="text-[10px] font-medium uppercase tracking-[0.3em] text-accent mb-2">What we fund</p>
              <h2 className="font-display text-3xl md:text-4xl font-light">Impact Projects</h2>
            </Reveal>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {projects.map((p, i) => (
                <Reveal key={p.id} delay={i * 60}>
                  <div className="group rounded-2xl border border-border/60 bg-card overflow-hidden hover:border-accent/30 hover:shadow-lg transition-all duration-300 h-full flex flex-col">
                    {p.cover_image ? (
                      <div className="aspect-video overflow-hidden bg-muted">
                        <img src={p.cover_image} alt={p.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                      </div>
                    ) : (
                      <div className="aspect-video bg-linear-to-br from-accent/10 to-accent/5 grid place-items-center">
                        <Heart className="size-8 text-accent/30" />
                      </div>
                    )}
                    <div className="p-5 space-y-3 flex-1 flex flex-col">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-display font-medium text-foreground leading-snug">{p.title}</h3>
                        <StatusPill status={p.status} />
                      </div>
                      {p.description && (
                        <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3 flex-1">{p.description}</p>
                      )}
                      {p.partner_org_name && (
                        <div className="text-xs text-muted-foreground pt-1">
                          Partner:{" "}
                          {p.partner_org_url ? (
                            <a href={p.partner_org_url} target="_blank" rel="noopener noreferrer"
                              className="text-accent hover:underline underline-offset-4 inline-flex items-center gap-0.5">
                              {p.partner_org_name} <ExternalLink className="size-3" />
                            </a>
                          ) : p.partner_org_name}
                        </div>
                      )}
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── DISBURSEMENTS ────────────────────────────────────────────────── */}
      {disbursements.length > 0 && (
        <section className="border-t border-border/40 bg-muted/20">
          <div className="container mx-auto px-6 py-20 max-w-5xl">
            <Reveal className="mb-12">
              <p className="text-[10px] font-medium uppercase tracking-[0.3em] text-accent mb-2">Where the money goes</p>
              <h2 className="font-display text-3xl md:text-4xl font-light">Disbursements</h2>
            </Reveal>
            <div className="space-y-3">
              {disbursements.map((d, i) => (
                <Reveal key={d.id} delay={i * 40}>
                  <div className="flex items-start gap-4 bg-card border border-border/60 rounded-2xl px-6 py-5 hover:border-accent/30 hover:shadow-sm transition-all duration-200">
                    <div className="size-10 rounded-full bg-emerald-50 border border-emerald-100 grid place-items-center shrink-0 mt-0.5">
                      <CheckCircle2 className="size-4 text-emerald-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="font-display font-medium text-lg text-foreground">{fmt(d.amount)}</span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(d.disbursed_date).toLocaleDateString("en-NP", { year: "numeric", month: "long", day: "numeric" })}
                        </span>
                        {d.receipt_url && (
                          <a href={d.receipt_url} target="_blank" rel="noopener noreferrer"
                            className="text-xs text-accent hover:underline underline-offset-4 inline-flex items-center gap-0.5">
                            View receipt <ExternalLink className="size-3" />
                          </a>
                        )}
                      </div>
                      {d.notes && <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{d.notes}</p>}
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
        <section className="border-t border-border/40">
          <div className="container mx-auto px-6 py-20 max-w-5xl">
            <Reveal className="mb-12">
              <p className="text-[10px] font-medium uppercase tracking-[0.3em] text-accent mb-2">From the field</p>
              <h2 className="font-display text-3xl md:text-4xl font-light">Stories & Updates</h2>
            </Reveal>
            <div className="grid sm:grid-cols-2 gap-6">
              {updates.map((u, i) => (
                <Reveal key={u.id} delay={i * 60}>
                  <div className={`group rounded-2xl border overflow-hidden bg-card hover:shadow-lg transition-all duration-300 h-full flex flex-col ${u.is_featured ? "border-accent/40 ring-1 ring-accent/20" : "border-border/60"}`}>
                    {u.images && u.images.length > 0 && (
                      <div className={`grid gap-0.5 ${u.images.length === 1 ? "grid-cols-1" : "grid-cols-2"} aspect-video overflow-hidden bg-muted`}>
                        {u.images.slice(0, 4).map((img, idx) => (
                          <img key={idx} src={img} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                        ))}
                      </div>
                    )}
                    <div className="p-6 space-y-3 flex-1 flex flex-col">
                      {u.is_featured && (
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-accent bg-accent/10 rounded-full px-3 py-1 w-fit">
                          <Sparkles className="size-3" /> Featured story
                        </span>
                      )}
                      <h3 className="font-display font-medium text-foreground leading-snug text-lg">{u.title}</h3>
                      {u.body && <p className="text-sm text-muted-foreground leading-relaxed line-clamp-4 flex-1">{u.body}</p>}
                      <p className="text-xs text-muted-foreground/70 mt-auto">
                        {new Date(u.published_at).toLocaleDateString("en-NP", { year: "numeric", month: "long", day: "numeric" })}
                      </p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── TESTIMONIALS ─────────────────────────────────────────────────── */}
      {testimonials.length > 0 && (
        <section className="border-t border-border/40 bg-muted/20">
          <div className="container mx-auto px-6 py-20 max-w-5xl">
            <Reveal className="mb-12 text-center">
              <p className="text-[10px] font-medium uppercase tracking-[0.3em] text-accent mb-2">Their words</p>
              <h2 className="font-display text-3xl md:text-4xl font-light">Voices from the ground</h2>
            </Reveal>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {testimonials.map((t, i) => (
                <Reveal key={t.id} delay={i * 60}>
                  <div className="bg-card border border-border/60 rounded-2xl p-6 space-y-5 hover:border-accent/30 hover:shadow-sm transition-all duration-200 h-full flex flex-col">
                    <blockquote className="text-muted-foreground leading-relaxed text-sm italic flex-1">
                      "{t.quote}"
                    </blockquote>
                    <div className="flex items-center gap-3 pt-2 border-t border-border/40">
                      {t.photo ? (
                        <img src={t.photo} alt={t.beneficiary_name ?? ""} className="size-9 rounded-full object-cover border border-border/40 shrink-0" />
                      ) : (
                        <div className="size-9 rounded-full bg-accent/10 grid place-items-center shrink-0">
                          <span className="text-accent font-semibold text-sm">{t.beneficiary_name?.[0]?.toUpperCase() ?? "?"}</span>
                        </div>
                      )}
                      <span className="font-medium text-sm text-foreground">{t.beneficiary_name ?? "Anonymous"}</span>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── SUGGEST A CAUSE ──────────────────────────────────────────────── */}
      <section className="border-t border-border/40">
        <div className="container mx-auto px-6 py-20 max-w-5xl">
          <Reveal className="text-center mb-12">
            <p className="text-[10px] font-medium uppercase tracking-[0.3em] text-accent mb-2">Have an idea?</p>
            <h2 className="font-display text-3xl md:text-4xl font-light mb-4">Suggest a cause</h2>
            <p className="text-muted-foreground text-base max-w-md mx-auto font-light">
              Know a community or cause that deserves support? Tell us — we consider every suggestion when planning future initiatives.
            </p>
          </Reveal>
          <Reveal delay={80}>
            <SuggestForm />
          </Reveal>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────────── */}
      <section className="border-t border-border/40 bg-[oklch(0.14_0.012_40)]">
        <div className="container mx-auto px-6 py-24 max-w-3xl text-center">
          <Reveal>
            <div className="size-14 rounded-full bg-accent/10 grid place-items-center mx-auto mb-8">
              <Heart className="size-7 text-accent" fill="currentColor" />
            </div>
            <h2 className="font-display text-4xl md:text-5xl font-light text-background leading-tight mb-6">
              Every purchase<br />matters
            </h2>
            <p className="text-background/60 mb-10 max-w-md mx-auto font-light leading-relaxed">
              When you shop at Aavira, {pct}% of your purchase goes straight into the {fundName} — no middlemen, full transparency.
            </p>
            <Link
              to="/"
              className="group inline-flex items-center gap-2 px-8 py-4 rounded-full bg-accent text-accent-foreground text-sm font-medium tracking-wide transition-all duration-300 hover:bg-accent/90 hover:shadow-[0_8px_40px_oklch(0.62_0.14_358/0.4)] hover:scale-[1.02] active:scale-[0.98]"
            >
              Shop & create impact
              <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          </Reveal>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
