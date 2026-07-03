import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Heart, ExternalLink, Download, Loader2, CheckCircle2 } from "lucide-react";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";

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
  goal_amount: number | null;
  raised_amount: number;
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

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="text-center">
      <CardContent className="pt-6">
        <div className="text-3xl font-display font-bold text-amber-700 mb-1">{value}</div>
        <div className="text-sm text-muted-foreground">{label}</div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    accrued: "bg-amber-100 text-amber-800",
    disbursed: "bg-green-100 text-green-800",
    planned: "bg-slate-100 text-slate-700",
    ongoing: "bg-blue-100 text-blue-700",
    completed: "bg-emerald-100 text-emerald-800",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${map[status] ?? "bg-gray-100 text-gray-700"}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-display text-2xl md:text-3xl font-semibold tracking-tight mb-6 text-stone-800">
      {children}
    </h2>
  );
}

// ─── Ledger CSV download ──────────────────────────────────────────────────────

function downloadCSV(entries: FundEntry[]) {
  const rows = [
    ["Month", "Year", "Revenue (NPR)", "Contribution (NPR)", "Status", "Notes"],
    ...entries.map((e) => [
      MONTHS[e.month - 1],
      e.year,
      e.total_revenue,
      e.contribution_amount ?? "",
      e.status,
      e.notes ?? "",
    ]),
  ];
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "aavira-impact-ledger.csv";
  a.click();
  URL.revokeObjectURL(url);
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
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <CheckCircle2 className="size-10 text-green-500" />
        <p className="text-lg font-medium text-stone-700">Thank you for your suggestion!</p>
        <p className="text-sm text-muted-foreground">We review all suggestions as we plan future impact initiatives.</p>
        <Button variant="outline" size="sm" onClick={() => { setDone(false); setForm({ name: "", email: "", suggestion: "" }); }}>
          Submit another
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4 max-w-lg mx-auto">
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="sg-name">Your name (optional)</Label>
          <Input id="sg-name" placeholder="Asha Tamang" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sg-email">Email (optional)</Label>
          <Input id="sg-email" type="email" placeholder="asha@example.com" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="sg-suggestion">Your suggestion <span className="text-rose-500">*</span></Label>
        <Textarea
          id="sg-suggestion"
          placeholder="Tell us about a cause or community you'd like us to support…"
          rows={4}
          value={form.suggestion}
          onChange={(e) => setForm((f) => ({ ...f, suggestion: e.target.value }))}
          required
        />
      </div>
      <Button type="submit" disabled={loading} className="w-full sm:w-auto">
        {loading ? <Loader2 className="size-4 animate-spin mr-2" /> : <Heart className="size-4 mr-2" />}
        Submit suggestion
      </Button>
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
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="size-8 animate-spin text-amber-500" />
      </div>
    );
  }

  if (settings && settings.is_page_public === false) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 text-stone-500">
        <p className="text-2xl font-serif text-stone-700">Coming soon</p>
        <p className="text-sm">The Aavira Impact page is not yet public.</p>
      </div>
    );
  }

  const totalCommitted = entries.reduce((acc, e) => acc + (e.contribution_amount ?? (e.total_revenue * (settings?.contribution_percentage ?? 5) / 100)), 0);
  const totalDisbursed = disbursements.reduce((acc, d) => acc + d.amount, 0);
  const monthsActive = entries.length;
  const lastEntry = entries[0];
  const lastEntryDate = lastEntry ? `${MONTHS[lastEntry.month - 1]} ${lastEntry.year}` : "—";

  return (
    <div className="min-h-screen bg-stone-50 text-stone-800 flex flex-col">
      <SiteNav />
      {/* Hero */}
      <section className="relative bg-gradient-to-br from-amber-50 via-rose-50 to-stone-50 border-b border-stone-200">
        <div className="max-w-4xl mx-auto px-4 py-20 text-center">
          <div className="inline-flex items-center gap-2 bg-rose-100 text-rose-700 rounded-full px-4 py-1.5 text-sm font-medium mb-6">
            <Heart className="size-4" fill="currentColor" />
            {settings?.fund_display_name ?? "Aavira Impact Fund"}
          </div>
          <h1 className="font-display text-4xl md:text-6xl font-bold tracking-tight text-stone-900 mb-6 leading-tight">
            Every purchase <br className="hidden md:block" />
            <span className="text-amber-600">creates impact</span>
          </h1>
          <p className="text-lg md:text-xl text-stone-600 max-w-2xl mx-auto mb-8 leading-relaxed">
            {settings?.contribution_percentage ?? 5}% of every sale goes to the {settings?.fund_display_name ?? "Aavira Impact Fund"} — supporting women and communities in Nepal.
          </p>
          <div className="inline-flex items-center gap-3 bg-white border border-stone-200 rounded-xl px-6 py-4 text-sm text-stone-600 shadow-sm">
            <span>Monthly revenue</span>
            <span className="text-stone-300">×</span>
            <span className="font-semibold text-amber-600">{settings?.contribution_percentage ?? 5}%</span>
            <span className="text-stone-300">=</span>
            <span className="font-semibold text-rose-600">Impact contribution</span>
          </div>
          {settings?.excluded_costs_note && (
            <p className="mt-6 text-sm text-stone-500 max-w-lg mx-auto">
              <strong>Note:</strong> {settings.excluded_costs_note}
            </p>
          )}
        </div>
      </section>

      {/* Live Stats */}
      <section className="max-w-5xl mx-auto px-4 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total committed" value={fmt(totalCommitted)} />
          <StatCard label="Total disbursed" value={fmt(totalDisbursed)} />
          <StatCard label="Months active" value={String(monthsActive)} />
          <StatCard label="Last entry" value={lastEntryDate} />
        </div>
      </section>

      {/* Monthly Ledger */}
      {settings?.is_public_ledger_visible && entries.length > 0 && (
        <section className="max-w-5xl mx-auto px-4 py-10 border-t border-stone-100">
          <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
            <SectionHeading>Monthly Ledger</SectionHeading>
            <Button variant="outline" size="sm" onClick={() => downloadCSV(entries)}>
              <Download className="size-4 mr-2" />
              Download CSV
            </Button>
          </div>
          <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-100 bg-stone-50">
                  <th className="text-left px-4 py-3 font-medium text-stone-500">Period</th>
                  <th className="text-right px-4 py-3 font-medium text-stone-500">Revenue</th>
                  <th className="text-right px-4 py-3 font-medium text-stone-500">Contribution</th>
                  <th className="text-left px-4 py-3 font-medium text-stone-500">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-stone-500">Notes</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} className="border-b border-stone-50 last:border-0 hover:bg-stone-50/60 transition-colors">
                    <td className="px-4 py-3 font-medium">{MONTHS[e.month - 1]} {e.year}</td>
                    <td className="px-4 py-3 text-right text-stone-600">{fmt(e.total_revenue)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-amber-700">
                      {e.contribution_amount != null ? fmt(e.contribution_amount) : fmt(e.total_revenue * (settings?.contribution_percentage ?? 5) / 100)}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={e.status} /></td>
                    <td className="px-4 py-3 text-stone-500 text-xs">{e.notes ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Projects */}
      {projects.length > 0 && (
        <section className="max-w-5xl mx-auto px-4 py-10 border-t border-stone-100">
          <SectionHeading>Impact Projects</SectionHeading>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map((p) => {
              const progress = p.goal_amount && p.goal_amount > 0 ? Math.min(100, (p.raised_amount / p.goal_amount) * 100) : null;
              return (
                <Card key={p.id} className="overflow-hidden border-stone-200 hover:shadow-md transition-shadow">
                  {p.cover_image && (
                    <div className="aspect-video overflow-hidden bg-stone-100">
                      <img src={p.cover_image} alt={p.title} className="w-full h-full object-cover" />
                    </div>
                  )}
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-display font-semibold text-stone-900 leading-tight">{p.title}</h3>
                      <StatusBadge status={p.status} />
                    </div>
                    {p.description && <p className="text-sm text-stone-600 leading-relaxed line-clamp-3">{p.description}</p>}
                    {progress !== null && (
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs text-stone-500">
                          <span>{fmt(p.raised_amount)} raised</span>
                          <span>Goal: {fmt(p.goal_amount!)}</span>
                        </div>
                        <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
                          <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${progress}%` }} />
                        </div>
                      </div>
                    )}
                    {p.partner_org_name && (
                      <div className="text-xs text-stone-500">
                        Partner:{" "}
                        {p.partner_org_url ? (
                          <a href={p.partner_org_url} target="_blank" rel="noopener noreferrer" className="text-amber-600 hover:underline inline-flex items-center gap-0.5">
                            {p.partner_org_name} <ExternalLink className="size-3" />
                          </a>
                        ) : (
                          p.partner_org_name
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {/* Disbursements */}
      {disbursements.length > 0 && (
        <section className="max-w-5xl mx-auto px-4 py-10 border-t border-stone-100">
          <SectionHeading>Disbursements</SectionHeading>
          <div className="space-y-3">
            {disbursements.map((d) => (
              <div key={d.id} className="flex items-start gap-4 bg-white border border-stone-200 rounded-xl px-5 py-4 shadow-sm hover:shadow-md transition-shadow">
                <div className="size-10 rounded-full bg-green-50 border border-green-100 grid place-items-center shrink-0">
                  <span className="text-green-600 font-bold text-xs">✓</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="font-semibold text-green-700">{fmt(d.amount)}</span>
                    <span className="text-xs text-stone-400">{new Date(d.disbursed_date).toLocaleDateString("en-NP", { year: "numeric", month: "long", day: "numeric" })}</span>
                    {d.receipt_url && (
                      <a href={d.receipt_url} target="_blank" rel="noopener noreferrer" className="text-xs text-amber-600 hover:underline inline-flex items-center gap-0.5">
                        View receipt <ExternalLink className="size-3" />
                      </a>
                    )}
                  </div>
                  {d.notes && <p className="text-sm text-stone-500 mt-1">{d.notes}</p>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Stories & Updates */}
      {updates.length > 0 && (
        <section className="max-w-5xl mx-auto px-4 py-10 border-t border-stone-100">
          <SectionHeading>Stories & Updates</SectionHeading>
          <div className="grid sm:grid-cols-2 gap-6">
            {updates.map((u) => (
              <Card key={u.id} className={`border-stone-200 overflow-hidden ${u.is_featured ? "ring-2 ring-amber-300" : ""}`}>
                {u.images && u.images.length > 0 && (
                  <div className={`grid gap-1 ${u.images.length === 1 ? "grid-cols-1" : "grid-cols-2"} aspect-video overflow-hidden bg-stone-100`}>
                    {u.images.slice(0, 4).map((img, i) => (
                      <img key={i} src={img} alt="" className="w-full h-full object-cover" />
                    ))}
                  </div>
                )}
                <CardContent className="p-5 space-y-2">
                  {u.is_featured && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 bg-amber-50 rounded-full px-2.5 py-0.5">
                      <Heart className="size-3" fill="currentColor" /> Featured
                    </span>
                  )}
                  <h3 className="font-display font-semibold text-stone-900">{u.title}</h3>
                  {u.body && <p className="text-sm text-stone-600 leading-relaxed line-clamp-4">{u.body}</p>}
                  <p className="text-xs text-stone-400">
                    {new Date(u.published_at).toLocaleDateString("en-NP", { year: "numeric", month: "long", day: "numeric" })}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Testimonials */}
      {testimonials.length > 0 && (
        <section className="max-w-5xl mx-auto px-4 py-10 border-t border-stone-100">
          <SectionHeading>Voices from the Ground</SectionHeading>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {testimonials.map((t) => (
              <Card key={t.id} className="border-stone-200 bg-white">
                <CardContent className="p-6 space-y-4">
                  <blockquote className="text-stone-700 leading-relaxed italic text-sm">
                    "{t.quote}"
                  </blockquote>
                  <div className="flex items-center gap-3">
                    {t.photo ? (
                      <img src={t.photo} alt={t.beneficiary_name ?? ""} className="size-9 rounded-full object-cover border border-stone-200" />
                    ) : (
                      <div className="size-9 rounded-full bg-amber-100 grid place-items-center shrink-0">
                        <span className="text-amber-700 font-semibold text-sm">
                          {t.beneficiary_name?.[0]?.toUpperCase() ?? "?"}
                        </span>
                      </div>
                    )}
                    <span className="font-medium text-sm text-stone-800">{t.beneficiary_name ?? "Anonymous"}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Suggest a Cause */}
      <section className="max-w-5xl mx-auto px-4 py-10 border-t border-stone-100">
        <div className="text-center mb-8">
          <SectionHeading>Suggest a Cause</SectionHeading>
          <p className="text-stone-500 text-sm max-w-md mx-auto">
            Know a community or cause that deserves support? Tell us about it — we consider all suggestions as we plan future initiatives.
          </p>
        </div>
        <SuggestForm />
      </section>

      {/* CTA Banner */}
      <section className="bg-amber-600 text-white py-16 mt-6">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <Heart className="size-10 mx-auto mb-4" fill="white" />
          <h2 className="font-display text-3xl font-bold mb-3">
            {settings?.contribution_percentage ?? 5}% of every purchase supports real impact
          </h2>
          <p className="text-amber-100 mb-8 max-w-xl mx-auto">
            When you shop at Aavira, you're part of something bigger. Every order contributes to the {settings?.fund_display_name ?? "Aavira Impact Fund"}.
          </p>
          <Link to="/" className="inline-flex items-center gap-2 bg-white text-amber-700 font-semibold px-6 py-3 rounded-full hover:bg-amber-50 transition-colors">
            Shop now
          </Link>
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}
