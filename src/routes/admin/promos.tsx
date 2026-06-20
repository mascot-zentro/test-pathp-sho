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
import { Trash2 } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/page-header";
import { type PromoCode } from "@/lib/admin-types";

export const Route = createFileRoute("/admin/promos")({
  ssr: false,
  component: PromosPage,
});

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

function PromosPage() {
  const [codes, setCodes] = useState<PromoCode[]>([]);
  const [editing, setEditing] = useState<PromoCode | null>(null);
  const [active, setActive] = useState(true);

  const load = () =>
    supabase.from("promo_codes").select("*").order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) toast.error(`Couldn't load promo codes: ${error.message}`);
        setCodes((data as PromoCode[]) ?? []);
      });
  useEffect(() => { load(); }, []);
  useEffect(() => { setActive(editing?.active ?? true); }, [editing]);

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

  return (
    <div>
      <AdminPageHeader title="Promo codes" description="Percent-off codes customers can apply at checkout or in the cart." />
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
                {editing && <p className="text-xs text-muted-foreground mt-1">Used {editing.used_count} time{editing.used_count === 1 ? "" : "s"} so far.</p>}
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
            <CardDescription>{codes.length} {codes.length === 1 ? "code" : "codes"}</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y border-t">
              {codes.map((p) => {
                const s = statusOf(p);
                return (
                  <div key={p.id} className="p-3 flex items-center gap-3 hover:bg-muted/30 transition">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium font-mono">{p.code} <Badge variant={s.variant} className="text-[10px] py-0 ml-1">{s.label}</Badge></div>
                      <div className="text-xs text-muted-foreground">
                        {p.discount_percent}% off · used {p.used_count}{p.max_uses !== null ? `/${p.max_uses}` : ""}
                        {p.expires_at ? ` · expires ${new Date(p.expires_at).toLocaleDateString()}` : ""}
                      </div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => setEditing(p)}>Edit</Button>
                    <Button size="sm" variant="ghost" onClick={() => del(p.id)}><Trash2 className="size-4" /></Button>
                  </div>
                );
              })}
              {codes.length === 0 && <div className="p-10 text-center text-sm text-muted-foreground">No promo codes yet.</div>}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
