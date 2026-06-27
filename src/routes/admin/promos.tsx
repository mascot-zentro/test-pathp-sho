import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Trash2, RefreshCw, ChevronDown, ChevronUp, ReceiptText } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/page-header";
import { type PromoCode } from "@/lib/admin-types";

export const Route = createFileRoute("/admin/promos")({
  ssr: false,
  component: PromosPage,
});

type UsageOrder = {
  id: string;
  customer_name: string;
  customer_phone: string;
  product_name: string;
  total: number;
  discount_amount: number;
  created_at: string;
  status: string;
};

function toInputDate(v: string | null) {
  return v ? v.slice(0, 10) : "";
}

function statusOf(p: PromoCode): { label: string; variant: "secondary" | "destructive" | "outline" } {
  if (!p.active) return { label: "disabled", variant: "secondary" };
  if (p.expires_at && new Date(p.expires_at) < new Date()) return { label: "expired", variant: "destructive" };
  if (p.starts_at && new Date(p.starts_at) > new Date()) return { label: "scheduled", variant: "outline" };
  if (p.max_uses !== null && p.used_count >= p.max_uses) return { label: "used up", variant: "destructive" };
  return { label: "active", variant: "outline" };
}

function UsagePanel({ code }: { code: string }) {
  const [orders, setOrders] = useState<UsageOrder[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("orders")
      .select("id,customer_name,customer_phone,product_name,total,discount_amount,created_at,status")
      .ilike("promo_code", code)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setOrders((data as UsageOrder[]) ?? []);
        setLoading(false);
      });
  }, [code]);

  if (loading) {
    return (
      <div className="px-4 py-3 space-y-2">
        {[1, 2].map((i) => <div key={i} className="h-8 bg-muted animate-pulse rounded" />)}
      </div>
    );
  }

  if (!orders || orders.length === 0) {
    return (
      <div className="px-4 py-3 text-xs text-muted-foreground">No orders have used this code yet.</div>
    );
  }

  const totalDiscount = orders.reduce((s, o) => s + Number(o.discount_amount), 0);
  const totalRevenue = orders.reduce((s, o) => s + Number(o.total), 0);

  return (
    <div className="border-t bg-muted/20">
      <div className="flex gap-6 px-4 py-3 border-b text-xs text-muted-foreground">
        <span>{orders.length} order{orders.length === 1 ? "" : "s"}</span>
        <span>NRS {totalRevenue.toLocaleString()} revenue</span>
        <span className="text-emerald-700">− NRS {totalDiscount.toLocaleString()} discounted</span>
      </div>
      <div className="divide-y max-h-64 overflow-y-auto">
        {orders.map((o) => (
          <div key={o.id} className="px-4 py-2.5 flex items-center justify-between gap-4 text-xs">
            <div className="min-w-0">
              <p className="font-medium truncate">{o.customer_name} · {o.customer_phone}</p>
              <p className="text-muted-foreground truncate">{o.product_name}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="font-medium tabular-nums">NRS {Number(o.total).toLocaleString()}</p>
              <p className="text-emerald-700 tabular-nums">− NRS {Number(o.discount_amount).toLocaleString()}</p>
              <p className="text-muted-foreground">{new Date(o.created_at).toLocaleDateString()}</p>
            </div>
            <Badge
              variant={o.status === "delivered" ? "outline" : o.status === "cancelled" ? "destructive" : "secondary"}
              className="text-[10px] py-0 shrink-0"
            >
              {o.status}
            </Badge>
          </div>
        ))}
      </div>
    </div>
  );
}

function PromoRow({ p, onEdit, onDelete }: { p: PromoCode; onEdit: () => void; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const s = statusOf(p);

  return (
    <div>
      <div className="p-3 flex items-center gap-3 hover:bg-muted/30 transition">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium font-mono">{p.code}</span>
            <Badge variant={s.variant} className="text-[10px] py-0">{s.label}</Badge>
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {p.discount_percent}% off
            {p.used_count > 0 ? (
              <span className="text-foreground font-medium"> · {p.used_count} use{p.used_count === 1 ? "" : "s"}</span>
            ) : " · unused"}
            {p.max_uses !== null ? `/${p.max_uses} max` : ""}
            {p.expires_at ? ` · expires ${new Date(p.expires_at).toLocaleDateString()}` : ""}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition px-2 py-1 rounded border"
          title="View usage history"
        >
          <ReceiptText className="size-3.5" />
          History
          {expanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
        </button>
        <Button size="sm" variant="outline" onClick={onEdit}>Edit</Button>
        <Button size="sm" variant="ghost" onClick={onDelete}><Trash2 className="size-4" /></Button>
      </div>
      {expanded && <UsagePanel code={p.code} />}
    </div>
  );
}

function PromosPage() {
  const [codes, setCodes] = useState<PromoCode[]>([]);
  const [editing, setEditing] = useState<PromoCode | null>(null);
  const [active, setActive] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = () => {
    setRefreshing(true);
    return supabase.from("promo_codes").select("*").order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) toast.error(`Couldn't load promo codes: ${error.message}`);
        setCodes((data as PromoCode[]) ?? []);
        setRefreshing(false);
      });
  };
  useEffect(() => { load(); }, []);
  useEffect(() => { setActive(editing?.active ?? true); }, [editing]);
  useEffect(() => {
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const save = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const code = String(f.get("code") || "").trim().toUpperCase();
    const discount = Number(f.get("discount_percent"));
    if (!code) return toast.error("Code is required");
    if (!discount || discount <= 0 || discount > 100) return toast.error("Discount must be between 1 and 100");
    const payload = {
      code,
      discount_percent: discount,
      max_uses: f.get("max_uses") ? Number(f.get("max_uses")) : null,
      starts_at: f.get("starts_at") ? new Date(String(f.get("starts_at"))).toISOString() : null,
      expires_at: f.get("expires_at") ? new Date(String(f.get("expires_at"))).toISOString() : null,
      active,
    };
    if (editing) {
      const { error } = await supabase.from("promo_codes").update(payload).eq("id", editing.id);
      if (error) return toast.error(error.message);
      toast.success("Updated");
      setEditing(null);
    } else {
      const { error } = await supabase.from("promo_codes").insert(payload);
      if (error) return toast.error(error.message);
      toast.success("Promo code created");
      (e.currentTarget as HTMLFormElement).reset();
      setActive(true);
    }
    load();
  };

  const del = async (id: string) => {
    if (!confirm("Delete this promo code? Past orders that used it keep their record either way.")) return;
    await supabase.from("promo_codes").delete().eq("id", id);
    load();
  };

  const totalUses = codes.reduce((s, c) => s + c.used_count, 0);
  const activeCodes = codes.filter((c) => statusOf(c).label === "active").length;

  return (
    <div>
      <AdminPageHeader
        title="Promo codes"
        description="Percent-off codes customers can apply at checkout or in the cart."
        actions={
          <Button type="button" variant="outline" size="sm" onClick={load} disabled={refreshing}>
            <RefreshCw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Refreshing…" : "Refresh"}
          </Button>
        }
      />

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Total codes</p>
          <p className="text-2xl font-bold tabular-nums">{codes.length}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Active</p>
          <p className="text-2xl font-bold tabular-nums text-emerald-600">{activeCodes}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Total uses</p>
          <p className="text-2xl font-bold tabular-nums">{totalUses}</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr,1.4fr] gap-6">
        <Card className="shadow-sm h-fit">
          <CardHeader className="pb-3">
            <CardTitle className="font-display text-xl">{editing ? "Edit code" : "New code"}</CardTitle>
            <CardDescription>
              {editing ? "Changes apply immediately to new orders." : "Leave usage limit or dates blank for no restriction."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={save} className="space-y-3">
              <div>
                <Label>Code</Label>
                <Input name="code" required placeholder="WELCOME10" defaultValue={editing?.code ?? ""} className="uppercase" />
              </div>
              <div>
                <Label>Discount %</Label>
                <Input name="discount_percent" type="number" min="1" max="100" required defaultValue={editing?.discount_percent ?? ""} />
              </div>
              <div>
                <Label>Max uses</Label>
                <Input name="max_uses" type="number" min="1" step="1" placeholder="Unlimited" defaultValue={editing?.max_uses ?? ""} />
                {editing && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Used {editing.used_count} time{editing.used_count === 1 ? "" : "s"} so far.
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Starts (optional)</Label><Input name="starts_at" type="date" defaultValue={toInputDate(editing?.starts_at ?? null)} /></div>
                <div><Label>Expires (optional)</Label><Input name="expires_at" type="date" defaultValue={toInputDate(editing?.expires_at ?? null)} /></div>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={active} onCheckedChange={setActive} id="promo_active" />
                <Label htmlFor="promo_active">Active</Label>
              </div>
              <div className="flex gap-2">
                <Button>{editing ? "Save changes" : "Create code"}</Button>
                {editing && <Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancel</Button>}
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="shadow-sm h-fit">
          <CardHeader className="pb-3">
            <CardTitle className="font-display text-xl">All codes</CardTitle>
            <CardDescription>{codes.length} {codes.length === 1 ? "code" : "codes"} · click "History" to see orders</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y border-t">
              {codes.map((p) => (
                <PromoRow
                  key={p.id}
                  p={p}
                  onEdit={() => setEditing(p)}
                  onDelete={() => del(p.id)}
                />
              ))}
              {codes.length === 0 && (
                <div className="p-10 text-center text-sm text-muted-foreground">No promo codes yet.</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
