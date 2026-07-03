/*
-- ============================================================
-- AAVIRA IMPACT — SQL SCHEMA
-- Run this in the Supabase SQL editor before using this page.
-- ============================================================

create table impact_settings (
  id uuid primary key default gen_random_uuid(),
  contribution_percentage numeric(5,2) not null default 5,
  fund_display_name text not null default 'Aavira Impact Fund',
  is_public_ledger_visible boolean not null default true,
  excluded_costs_note text,
  updated_at timestamptz default now()
);
insert into impact_settings (id) values (gen_random_uuid()) on conflict do nothing;

create table impact_fund_entries (
  id uuid primary key default gen_random_uuid(),
  month int not null,
  year int not null,
  total_revenue numeric(12,2) not null default 0,
  contribution_amount numeric(12,2),
  status text not null default 'accrued' check (status in ('accrued','disbursed')),
  notes text,
  created_at timestamptz default now(),
  unique(month, year)
);

create table impact_projects (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  cover_image text,
  goal_amount numeric(12,2),
  raised_amount numeric(12,2) default 0,
  status text not null default 'planned' check (status in ('planned','ongoing','completed')),
  partner_org_name text,
  partner_org_url text,
  start_date date,
  end_date date,
  display_order int default 0,
  is_published boolean default false,
  created_at timestamptz default now()
);

create table impact_disbursements (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references impact_projects(id) on delete set null,
  amount numeric(12,2) not null,
  disbursed_date date not null,
  receipt_url text,
  notes text,
  created_at timestamptz default now()
);

create table impact_updates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text,
  images text[],
  linked_project_id uuid references impact_projects(id) on delete set null,
  published_at timestamptz,
  is_featured boolean default false,
  created_at timestamptz default now()
);

create table impact_testimonials (
  id uuid primary key default gen_random_uuid(),
  beneficiary_name text,
  photo text,
  quote text not null,
  linked_project_id uuid references impact_projects(id) on delete set null,
  consent_confirmed boolean default false,
  is_published boolean default false,
  created_at timestamptz default now()
);

create table impact_cause_suggestions (
  id uuid primary key default gen_random_uuid(),
  name text,
  email text,
  suggestion text not null,
  status text not null default 'new' check (status in ('new','reviewed','actioned')),
  created_at timestamptz default now()
);

-- RLS
alter table impact_settings enable row level security;
alter table impact_fund_entries enable row level security;
alter table impact_projects enable row level security;
alter table impact_disbursements enable row level security;
alter table impact_updates enable row level security;
alter table impact_testimonials enable row level security;
alter table impact_cause_suggestions enable row level security;

create policy "public read settings" on impact_settings for select using (true);
create policy "public read fund entries" on impact_fund_entries for select using (true);
create policy "public read published projects" on impact_projects for select using (is_published = true);
create policy "public read disbursements" on impact_disbursements for select using (true);
create policy "public read published updates" on impact_updates for select using (published_at is not null);
create policy "public read published testimonials" on impact_testimonials for select using (is_published = true);
create policy "public insert suggestions" on impact_cause_suggestions for insert with check (true);
*/

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AdminPageHeader } from "@/components/admin/page-header";
import { ImageUpload } from "@/components/image-upload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Plus, Pencil, Trash2, Eye, EyeOff } from "lucide-react";

export const Route = createFileRoute("/admin/impact")({
  ssr: false,
  component: AdminImpactPage,
});

// ─── Types ───────────────────────────────────────────────────────────────────

type Settings = {
  id: string;
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
  start_date: string | null;
  end_date: string | null;
  display_order: number;
  is_published: boolean;
};

type Disbursement = {
  id: string;
  project_id: string | null;
  amount: number;
  disbursed_date: string;
  receipt_url: string | null;
  notes: string | null;
};

type Update = {
  id: string;
  title: string;
  body: string | null;
  images: string[] | null;
  linked_project_id: string | null;
  published_at: string | null;
  is_featured: boolean;
};

type Testimonial = {
  id: string;
  beneficiary_name: string | null;
  photo: string | null;
  quote: string;
  linked_project_id: string | null;
  consent_confirmed: boolean;
  is_published: boolean;
};

type Suggestion = {
  id: string;
  name: string | null;
  email: string | null;
  suggestion: string;
  status: "new" | "reviewed" | "actioned";
  created_at: string;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const db = supabase as any;

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    accrued: "bg-amber-100 text-amber-800",
    disbursed: "bg-green-100 text-green-800",
    planned: "bg-slate-100 text-slate-700",
    ongoing: "bg-blue-100 text-blue-700",
    completed: "bg-emerald-100 text-emerald-800",
    new: "bg-blue-100 text-blue-800",
    reviewed: "bg-amber-100 text-amber-800",
    actioned: "bg-green-100 text-green-800",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${map[status] ?? "bg-gray-100 text-gray-700"}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────

function SettingsTab() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    db.from("impact_settings").select("*").limit(1).single().then(({ data }: any) => {
      if (data) setSettings(data);
    });
  }, []);

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    const { error } = await db.from("impact_settings").upsert({ ...settings, updated_at: new Date().toISOString() });
    setSaving(false);
    if (error) toast.error("Failed to save settings");
    else toast.success("Settings saved");
  };

  if (!settings) return <div className="flex justify-center py-12"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>;

  return (
    <Card>
      <CardHeader><CardTitle>Impact Fund Settings</CardTitle></CardHeader>
      <CardContent className="space-y-5 max-w-lg">
        <FieldRow label="Contribution percentage (%)">
          <Input
            type="number"
            min={0}
            max={100}
            step={0.01}
            value={settings.contribution_percentage}
            onChange={(e) => setSettings((s) => s && ({ ...s, contribution_percentage: parseFloat(e.target.value) || 0 }))}
          />
        </FieldRow>
        <FieldRow label="Fund display name">
          <Input
            value={settings.fund_display_name}
            onChange={(e) => setSettings((s) => s && ({ ...s, fund_display_name: e.target.value }))}
          />
        </FieldRow>
        <div className="flex items-center gap-3">
          <input
            id="page-public"
            type="checkbox"
            className="size-4 rounded border-stone-300"
            checked={settings.is_page_public ?? true}
            onChange={(e) => setSettings((s) => s && ({ ...s, is_page_public: e.target.checked }))}
          />
          <Label htmlFor="page-public">Make /impact page publicly visible</Label>
        </div>
        <div className="flex items-center gap-3">
          <input
            id="ledger-visible"
            type="checkbox"
            className="size-4 rounded border-stone-300"
            checked={settings.is_public_ledger_visible}
            onChange={(e) => setSettings((s) => s && ({ ...s, is_public_ledger_visible: e.target.checked }))}
          />
          <Label htmlFor="ledger-visible">Show public ledger on /impact page</Label>
        </div>
        <FieldRow label="Excluded costs note (optional)">
          <Textarea
            rows={3}
            placeholder="e.g. Contribution is calculated on revenue after platform fees and payment processing costs."
            value={settings.excluded_costs_note ?? ""}
            onChange={(e) => setSettings((s) => s && ({ ...s, excluded_costs_note: e.target.value || null }))}
          />
        </FieldRow>
        <Button onClick={save} disabled={saving}>
          {saving && <Loader2 className="size-4 mr-2 animate-spin" />}
          Save settings
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Fund Entries Tab ─────────────────────────────────────────────────────────

const EMPTY_ENTRY = { month: 1, year: new Date().getFullYear(), total_revenue: 0, contribution_amount: null as number | null, status: "accrued" as const, notes: "" };

function FundEntriesTab({ pct }: { pct: number }) {
  const [entries, setEntries] = useState<FundEntry[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<FundEntry | null>(null);
  const [form, setForm] = useState({ ...EMPTY_ENTRY });
  const [saving, setSaving] = useState(false);

  const load = () => {
    db.from("impact_fund_entries").select("*").order("year", { ascending: false }).order("month", { ascending: false })
      .then(({ data }: any) => setEntries(data ?? []));
  };
  useEffect(load, []);

  const openAdd = () => { setForm({ ...EMPTY_ENTRY }); setEditing(null); setOpen(true); };
  const openEdit = (e: FundEntry) => { setForm({ month: e.month, year: e.year, total_revenue: e.total_revenue, contribution_amount: e.contribution_amount, status: e.status, notes: e.notes ?? "" }); setEditing(e); setOpen(true); };

  const save = async () => {
    setSaving(true);
    const payload = { ...form, notes: form.notes || null, contribution_amount: form.contribution_amount };
    const { error } = editing
      ? await db.from("impact_fund_entries").update(payload).eq("id", editing.id)
      : await db.from("impact_fund_entries").insert(payload);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(editing ? "Entry updated" : "Entry added");
    setOpen(false);
    load();
  };

  const del = async (id: string) => {
    if (!confirm("Delete this entry?")) return;
    await db.from("impact_fund_entries").delete().eq("id", id);
    toast.success("Deleted");
    load();
  };

  const autoContrib = (form.total_revenue * pct / 100).toFixed(2);

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button size="sm" onClick={openAdd}><Plus className="size-4 mr-2" />Add entry</Button>
      </div>
      <div className="rounded-xl border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Period</TableHead>
              <TableHead className="text-right">Revenue</TableHead>
              <TableHead className="text-right">Contribution</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-10">No entries yet</TableCell></TableRow>
            )}
            {entries.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="font-medium">{MONTHS[e.month - 1]} {e.year}</TableCell>
                <TableCell className="text-right">NPR {e.total_revenue.toLocaleString()}</TableCell>
                <TableCell className="text-right font-semibold text-amber-700">
                  NPR {(e.contribution_amount ?? (e.total_revenue * pct / 100)).toLocaleString()}
                </TableCell>
                <TableCell><StatusBadge status={e.status} /></TableCell>
                <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{e.notes ?? ""}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="size-7" onClick={() => openEdit(e)}><Pencil className="size-3.5" /></Button>
                    <Button size="icon" variant="ghost" className="size-7 text-destructive" onClick={() => del(e.id)}><Trash2 className="size-3.5" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? "Edit" : "Add"} Fund Entry</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <FieldRow label="Month">
                <Select value={String(form.month)} onValueChange={(v) => setForm((f) => ({ ...f, month: parseInt(v) }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FieldRow>
              <FieldRow label="Year">
                <Input type="number" value={form.year} onChange={(e) => setForm((f) => ({ ...f, year: parseInt(e.target.value) || 0 }))} />
              </FieldRow>
            </div>
            <FieldRow label="Total revenue (NPR)">
              <Input type="number" step="0.01" value={form.total_revenue} onChange={(e) => setForm((f) => ({ ...f, total_revenue: parseFloat(e.target.value) || 0 }))} />
            </FieldRow>
            <FieldRow label={`Contribution amount (auto: NPR ${autoContrib})`}>
              <Input
                type="number"
                step="0.01"
                placeholder={autoContrib}
                value={form.contribution_amount ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, contribution_amount: e.target.value ? parseFloat(e.target.value) : null }))}
              />
              <p className="text-xs text-muted-foreground">Leave blank to auto-calculate from {pct}%</p>
            </FieldRow>
            <FieldRow label="Status">
              <Select value={form.status} onValueChange={(v: any) => setForm((f) => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="accrued">Accrued</SelectItem>
                  <SelectItem value="disbursed">Disbursed</SelectItem>
                </SelectContent>
              </Select>
            </FieldRow>
            <FieldRow label="Notes (optional)">
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </FieldRow>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="size-4 mr-2 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Projects Tab ─────────────────────────────────────────────────────────────

const EMPTY_PROJECT: Omit<Project, "id"> = {
  title: "",
  description: null,
  cover_image: null,
  goal_amount: null,
  raised_amount: 0,
  status: "planned",
  partner_org_name: null,
  partner_org_url: null,
  start_date: null,
  end_date: null,
  display_order: 0,
  is_published: false,
};

function ProjectsTab() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [form, setForm] = useState<Omit<Project, "id">>({ ...EMPTY_PROJECT });
  const [saving, setSaving] = useState(false);

  const load = () => {
    db.from("impact_projects").select("*").order("display_order").then(({ data }: any) => setProjects(data ?? []));
  };
  useEffect(load, []);

  const openAdd = () => { setForm({ ...EMPTY_PROJECT }); setEditing(null); setOpen(true); };
  const openEdit = (p: Project) => {
    const { id, ...rest } = p;
    setForm(rest);
    setEditing(p);
    setOpen(true);
  };

  const save = async () => {
    if (!form.title.trim()) { toast.error("Title is required"); return; }
    setSaving(true);
    const payload = { ...form };
    const { error } = editing
      ? await db.from("impact_projects").update(payload).eq("id", editing.id)
      : await db.from("impact_projects").insert(payload);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(editing ? "Project updated" : "Project added");
    setOpen(false);
    load();
  };

  const del = async (id: string) => {
    if (!confirm("Delete this project?")) return;
    await db.from("impact_projects").delete().eq("id", id);
    toast.success("Deleted");
    load();
  };

  const togglePublished = async (p: Project) => {
    await db.from("impact_projects").update({ is_published: !p.is_published }).eq("id", p.id);
    load();
  };

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button size="sm" onClick={openAdd}><Plus className="size-4 mr-2" />Add project</Button>
      </div>
      <div className="space-y-3">
        {projects.length === 0 && <p className="text-center text-muted-foreground py-10">No projects yet</p>}
        {projects.map((p) => (
          <div key={p.id} className="flex items-center gap-4 border rounded-xl p-4 bg-card">
            {p.cover_image && <img src={p.cover_image} alt="" className="size-14 rounded-lg object-cover shrink-0" />}
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{p.title}</div>
              <div className="flex items-center gap-2 mt-1">
                <StatusBadge status={p.status} />
                {p.partner_org_name && <span className="text-xs text-muted-foreground">· {p.partner_org_name}</span>}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button size="icon" variant="ghost" className="size-8" onClick={() => togglePublished(p)} title={p.is_published ? "Unpublish" : "Publish"}>
                {p.is_published ? <Eye className="size-4 text-green-600" /> : <EyeOff className="size-4 text-muted-foreground" />}
              </Button>
              <Button size="icon" variant="ghost" className="size-8" onClick={() => openEdit(p)}><Pencil className="size-4" /></Button>
              <Button size="icon" variant="ghost" className="size-8 text-destructive" onClick={() => del(p.id)}><Trash2 className="size-4" /></Button>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit" : "Add"} Project</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <FieldRow label="Title *">
              <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
            </FieldRow>
            <FieldRow label="Description">
              <Textarea rows={3} value={form.description ?? ""} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value || null }))} />
            </FieldRow>
            <ImageUpload bucket="impact" value={form.cover_image} onChange={(url) => setForm((f) => ({ ...f, cover_image: url }))} label="Cover image" aspect="wide" />
            <div className="grid grid-cols-2 gap-4">
              <FieldRow label="Goal amount (NPR)">
                <Input type="number" step="0.01" value={form.goal_amount ?? ""} onChange={(e) => setForm((f) => ({ ...f, goal_amount: e.target.value ? parseFloat(e.target.value) : null }))} />
              </FieldRow>
              <FieldRow label="Raised amount (NPR)">
                <Input type="number" step="0.01" value={form.raised_amount} onChange={(e) => setForm((f) => ({ ...f, raised_amount: parseFloat(e.target.value) || 0 }))} />
              </FieldRow>
            </div>
            <FieldRow label="Status">
              <Select value={form.status} onValueChange={(v: any) => setForm((f) => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="planned">Planned</SelectItem>
                  <SelectItem value="ongoing">Ongoing</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </FieldRow>
            <FieldRow label="Partner org name">
              <Input value={form.partner_org_name ?? ""} onChange={(e) => setForm((f) => ({ ...f, partner_org_name: e.target.value || null }))} />
            </FieldRow>
            <FieldRow label="Partner org URL">
              <Input type="url" placeholder="https://" value={form.partner_org_url ?? ""} onChange={(e) => setForm((f) => ({ ...f, partner_org_url: e.target.value || null }))} />
            </FieldRow>
            <div className="grid grid-cols-2 gap-4">
              <FieldRow label="Start date">
                <Input type="date" value={form.start_date ?? ""} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value || null }))} />
              </FieldRow>
              <FieldRow label="End date">
                <Input type="date" value={form.end_date ?? ""} onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value || null }))} />
              </FieldRow>
            </div>
            <FieldRow label="Display order">
              <Input type="number" value={form.display_order} onChange={(e) => setForm((f) => ({ ...f, display_order: parseInt(e.target.value) || 0 }))} />
            </FieldRow>
            <div className="flex items-center gap-3">
              <input id="proj-pub" type="checkbox" className="size-4 rounded border-stone-300" checked={form.is_published} onChange={(e) => setForm((f) => ({ ...f, is_published: e.target.checked }))} />
              <Label htmlFor="proj-pub">Published (visible on public page)</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="size-4 mr-2 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Disbursements Tab ────────────────────────────────────────────────────────

function DisbursementsTab({ projects }: { projects: Project[] }) {
  const [items, setItems] = useState<Disbursement[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ project_id: "" as string | null, amount: 0, disbursed_date: "", receipt_url: null as string | null, notes: "" });
  const [saving, setSaving] = useState(false);

  const load = () => {
    db.from("impact_disbursements").select("*").order("disbursed_date", { ascending: false }).then(({ data }: any) => setItems(data ?? []));
  };
  useEffect(load, []);

  const save = async () => {
    if (!form.disbursed_date || form.amount <= 0) { toast.error("Date and amount are required"); return; }
    setSaving(true);
    const { error } = await db.from("impact_disbursements").insert({
      ...form,
      project_id: form.project_id || null,
      notes: form.notes || null,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Disbursement added");
    setOpen(false);
    setForm({ project_id: null, amount: 0, disbursed_date: "", receipt_url: null, notes: "" });
    load();
  };

  const del = async (id: string) => {
    if (!confirm("Delete?")) return;
    await db.from("impact_disbursements").delete().eq("id", id);
    toast.success("Deleted");
    load();
  };

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button size="sm" onClick={() => setOpen(true)}><Plus className="size-4 mr-2" />Add disbursement</Button>
      </div>
      <div className="rounded-xl border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Project</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead>Receipt</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-10">No disbursements yet</TableCell></TableRow>}
            {items.map((d) => (
              <TableRow key={d.id}>
                <TableCell>{d.disbursed_date}</TableCell>
                <TableCell className="text-right font-semibold text-green-700">NPR {d.amount.toLocaleString()}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{projects.find((p) => p.id === d.project_id)?.title ?? "—"}</TableCell>
                <TableCell className="text-xs max-w-[180px] truncate">{d.notes ?? ""}</TableCell>
                <TableCell>{d.receipt_url ? <a href={d.receipt_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">View</a> : "—"}</TableCell>
                <TableCell>
                  <Button size="icon" variant="ghost" className="size-7 text-destructive" onClick={() => del(d.id)}><Trash2 className="size-3.5" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Disbursement</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <FieldRow label="Amount (NPR) *">
              <Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: parseFloat(e.target.value) || 0 }))} />
            </FieldRow>
            <FieldRow label="Date *">
              <Input type="date" value={form.disbursed_date} onChange={(e) => setForm((f) => ({ ...f, disbursed_date: e.target.value }))} />
            </FieldRow>
            <FieldRow label="Linked project (optional)">
              <Select value={form.project_id ?? "_none"} onValueChange={(v) => setForm((f) => ({ ...f, project_id: v === "_none" ? null : v }))}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">None</SelectItem>
                  {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </FieldRow>
            <ImageUpload bucket="impact" value={form.receipt_url} onChange={(url) => setForm((f) => ({ ...f, receipt_url: url }))} label="Receipt (optional)" aspect="wide" />
            <FieldRow label="Notes">
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </FieldRow>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="size-4 mr-2 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Updates Tab ──────────────────────────────────────────────────────────────

function UpdatesTab({ projects }: { projects: Project[] }) {
  const [items, setItems] = useState<Update[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Update | null>(null);
  const [form, setForm] = useState({ title: "", body: "", linked_project_id: null as string | null, published_at: "", is_featured: false, images_csv: "" });
  const [saving, setSaving] = useState(false);

  const load = () => {
    db.from("impact_updates").select("*").order("created_at", { ascending: false }).then(({ data }: any) => setItems(data ?? []));
  };
  useEffect(load, []);

  const openAdd = () => { setForm({ title: "", body: "", linked_project_id: null, published_at: "", is_featured: false, images_csv: "" }); setEditing(null); setOpen(true); };
  const openEdit = (u: Update) => {
    setForm({ title: u.title, body: u.body ?? "", linked_project_id: u.linked_project_id, published_at: u.published_at ?? "", is_featured: u.is_featured, images_csv: u.images?.join(", ") ?? "" });
    setEditing(u);
    setOpen(true);
  };

  const save = async () => {
    if (!form.title.trim()) { toast.error("Title is required"); return; }
    setSaving(true);
    const images = form.images_csv.split(",").map((s) => s.trim()).filter(Boolean);
    const payload = {
      title: form.title,
      body: form.body || null,
      linked_project_id: form.linked_project_id || null,
      published_at: form.published_at || null,
      is_featured: form.is_featured,
      images: images.length ? images : null,
    };
    const { error } = editing
      ? await db.from("impact_updates").update(payload).eq("id", editing.id)
      : await db.from("impact_updates").insert(payload);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(editing ? "Update saved" : "Update added");
    setOpen(false);
    load();
  };

  const del = async (id: string) => {
    if (!confirm("Delete?")) return;
    await db.from("impact_updates").delete().eq("id", id);
    toast.success("Deleted");
    load();
  };

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button size="sm" onClick={openAdd}><Plus className="size-4 mr-2" />Add update</Button>
      </div>
      <div className="space-y-3">
        {items.length === 0 && <p className="text-center text-muted-foreground py-10">No updates yet</p>}
        {items.map((u) => (
          <div key={u.id} className="flex items-start gap-4 border rounded-xl p-4 bg-card">
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{u.title}</div>
              <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                {u.is_featured && <span className="text-amber-600 font-medium">Featured</span>}
                <span>{u.published_at ? `Published ${new Date(u.published_at).toLocaleDateString()}` : "Draft"}</span>
              </div>
            </div>
            <div className="flex gap-1 shrink-0">
              <Button size="icon" variant="ghost" className="size-8" onClick={() => openEdit(u)}><Pencil className="size-4" /></Button>
              <Button size="icon" variant="ghost" className="size-8 text-destructive" onClick={() => del(u.id)}><Trash2 className="size-4" /></Button>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit" : "Add"} Update</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <FieldRow label="Title *">
              <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
            </FieldRow>
            <FieldRow label="Body">
              <Textarea rows={5} value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} />
            </FieldRow>
            <FieldRow label="Linked project (optional)">
              <Select value={form.linked_project_id ?? "_none"} onValueChange={(v) => setForm((f) => ({ ...f, linked_project_id: v === "_none" ? null : v }))}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">None</SelectItem>
                  {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </FieldRow>
            <FieldRow label="Published at (leave blank for draft)">
              <Input type="datetime-local" value={form.published_at} onChange={(e) => setForm((f) => ({ ...f, published_at: e.target.value }))} />
            </FieldRow>
            <FieldRow label="Image URLs (comma-separated)">
              <Textarea rows={2} placeholder="https://..., https://..." value={form.images_csv} onChange={(e) => setForm((f) => ({ ...f, images_csv: e.target.value }))} />
            </FieldRow>
            <div className="flex items-center gap-3">
              <input id="upd-feat" type="checkbox" className="size-4 rounded border-stone-300" checked={form.is_featured} onChange={(e) => setForm((f) => ({ ...f, is_featured: e.target.checked }))} />
              <Label htmlFor="upd-feat">Feature this update</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="size-4 mr-2 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Testimonials Tab ─────────────────────────────────────────────────────────

function TestimonialsTab({ projects }: { projects: Project[] }) {
  const [items, setItems] = useState<Testimonial[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Testimonial | null>(null);
  const [form, setForm] = useState({ beneficiary_name: "", photo: null as string | null, quote: "", linked_project_id: null as string | null, consent_confirmed: false, is_published: false });
  const [saving, setSaving] = useState(false);

  const load = () => {
    db.from("impact_testimonials").select("*").order("created_at", { ascending: false }).then(({ data }: any) => setItems(data ?? []));
  };
  useEffect(load, []);

  const openAdd = () => { setForm({ beneficiary_name: "", photo: null, quote: "", linked_project_id: null, consent_confirmed: false, is_published: false }); setEditing(null); setOpen(true); };
  const openEdit = (t: Testimonial) => {
    setForm({ beneficiary_name: t.beneficiary_name ?? "", photo: t.photo, quote: t.quote, linked_project_id: t.linked_project_id, consent_confirmed: t.consent_confirmed, is_published: t.is_published });
    setEditing(t);
    setOpen(true);
  };

  const save = async () => {
    if (!form.quote.trim()) { toast.error("Quote is required"); return; }
    if (!form.consent_confirmed) { toast.error("Consent must be confirmed"); return; }
    setSaving(true);
    const payload = { ...form, beneficiary_name: form.beneficiary_name || null, linked_project_id: form.linked_project_id || null };
    const { error } = editing
      ? await db.from("impact_testimonials").update(payload).eq("id", editing.id)
      : await db.from("impact_testimonials").insert(payload);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(editing ? "Testimonial updated" : "Testimonial added");
    setOpen(false);
    load();
  };

  const del = async (id: string) => {
    if (!confirm("Delete?")) return;
    await db.from("impact_testimonials").delete().eq("id", id);
    toast.success("Deleted");
    load();
  };

  const togglePublished = async (t: Testimonial) => {
    await db.from("impact_testimonials").update({ is_published: !t.is_published }).eq("id", t.id);
    load();
  };

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button size="sm" onClick={openAdd}><Plus className="size-4 mr-2" />Add testimonial</Button>
      </div>
      <div className="space-y-3">
        {items.length === 0 && <p className="text-center text-muted-foreground py-10">No testimonials yet</p>}
        {items.map((t) => (
          <div key={t.id} className="flex items-start gap-4 border rounded-xl p-4 bg-card">
            {t.photo && <img src={t.photo} alt="" className="size-10 rounded-full object-cover shrink-0" />}
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm">{t.beneficiary_name ?? "Anonymous"}</div>
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 italic">"{t.quote}"</p>
            </div>
            <div className="flex gap-1 shrink-0">
              <Button size="icon" variant="ghost" className="size-8" onClick={() => togglePublished(t)} title={t.is_published ? "Unpublish" : "Publish"}>
                {t.is_published ? <Eye className="size-4 text-green-600" /> : <EyeOff className="size-4 text-muted-foreground" />}
              </Button>
              <Button size="icon" variant="ghost" className="size-8" onClick={() => openEdit(t)}><Pencil className="size-4" /></Button>
              <Button size="icon" variant="ghost" className="size-8 text-destructive" onClick={() => del(t.id)}><Trash2 className="size-4" /></Button>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit" : "Add"} Testimonial</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <FieldRow label="Beneficiary name">
              <Input value={form.beneficiary_name} onChange={(e) => setForm((f) => ({ ...f, beneficiary_name: e.target.value }))} />
            </FieldRow>
            <ImageUpload bucket="impact" value={form.photo} onChange={(url) => setForm((f) => ({ ...f, photo: url }))} label="Photo (optional)" />
            <FieldRow label="Quote *">
              <Textarea rows={4} value={form.quote} onChange={(e) => setForm((f) => ({ ...f, quote: e.target.value }))} />
            </FieldRow>
            <FieldRow label="Linked project (optional)">
              <Select value={form.linked_project_id ?? "_none"} onValueChange={(v) => setForm((f) => ({ ...f, linked_project_id: v === "_none" ? null : v }))}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">None</SelectItem>
                  {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </FieldRow>
            <div className="flex items-center gap-3">
              <input id="t-consent" type="checkbox" className="size-4 rounded border-stone-300" checked={form.consent_confirmed} onChange={(e) => setForm((f) => ({ ...f, consent_confirmed: e.target.checked }))} />
              <Label htmlFor="t-consent" className="text-sm">Consent confirmed <span className="text-destructive">*</span></Label>
            </div>
            <div className="flex items-center gap-3">
              <input id="t-pub" type="checkbox" className="size-4 rounded border-stone-300" checked={form.is_published} onChange={(e) => setForm((f) => ({ ...f, is_published: e.target.checked }))} />
              <Label htmlFor="t-pub">Published</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="size-4 mr-2 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Suggestions Tab ──────────────────────────────────────────────────────────

function SuggestionsTab() {
  const [items, setItems] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    db.from("impact_cause_suggestions").select("*").order("created_at", { ascending: false }).then(({ data }: any) => {
      setItems(data ?? []);
      setLoading(false);
    });
  };
  useEffect(load, []);

  const updateStatus = async (id: string, status: string) => {
    await db.from("impact_cause_suggestions").update({ status }).eq("id", id);
    setItems((prev) => prev.map((s) => s.id === id ? { ...s, status: status as Suggestion["status"] } : s));
    toast.success("Status updated");
  };

  return (
    <div className="rounded-xl border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Name / Email</TableHead>
            <TableHead>Suggestion</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading && <TableRow><TableCell colSpan={4} className="text-center py-10"><Loader2 className="size-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>}
          {!loading && items.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-10">No suggestions yet</TableCell></TableRow>}
          {items.map((s) => (
            <TableRow key={s.id}>
              <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{new Date(s.created_at).toLocaleDateString()}</TableCell>
              <TableCell className="text-sm">
                <div>{s.name ?? <span className="italic text-muted-foreground">Anonymous</span>}</div>
                {s.email && <div className="text-xs text-muted-foreground">{s.email}</div>}
              </TableCell>
              <TableCell className="text-sm max-w-[280px]">{s.suggestion}</TableCell>
              <TableCell>
                <Select value={s.status} onValueChange={(v) => updateStatus(s.id, v)}>
                  <SelectTrigger className="h-7 text-xs w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">New</SelectItem>
                    <SelectItem value="reviewed">Reviewed</SelectItem>
                    <SelectItem value="actioned">Actioned</SelectItem>
                  </SelectContent>
                </Select>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function AdminImpactPage() {
  const [pct, setPct] = useState(5);
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    db.from("impact_settings").select("contribution_percentage").limit(1).single().then(({ data }: any) => {
      if (data) setPct(data.contribution_percentage);
    });
    db.from("impact_projects").select("*").order("display_order").then(({ data }: any) => {
      setProjects(data ?? []);
    });
  }, []);

  return (
    <>
      <AdminPageHeader
        title="Impact"
        description="Manage the Aavira Impact Fund — settings, monthly ledger, projects, disbursements, stories, and testimonials."
      />
      <Tabs defaultValue="settings">
        <TabsList className="mb-6 flex-wrap h-auto gap-1">
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="entries">Fund Entries</TabsTrigger>
          <TabsTrigger value="projects">Projects</TabsTrigger>
          <TabsTrigger value="disbursements">Disbursements</TabsTrigger>
          <TabsTrigger value="updates">Updates</TabsTrigger>
          <TabsTrigger value="testimonials">Testimonials</TabsTrigger>
          <TabsTrigger value="suggestions">Suggestions</TabsTrigger>
        </TabsList>

        <TabsContent value="settings"><SettingsTab /></TabsContent>
        <TabsContent value="entries"><FundEntriesTab pct={pct} /></TabsContent>
        <TabsContent value="projects"><ProjectsTab /></TabsContent>
        <TabsContent value="disbursements"><DisbursementsTab projects={projects} /></TabsContent>
        <TabsContent value="updates"><UpdatesTab projects={projects} /></TabsContent>
        <TabsContent value="testimonials"><TestimonialsTab projects={projects} /></TabsContent>
        <TabsContent value="suggestions"><SuggestionsTab /></TabsContent>
      </Tabs>
    </>
  );
}
