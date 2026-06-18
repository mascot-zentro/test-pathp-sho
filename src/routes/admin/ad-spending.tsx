import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AdminPageHeader } from "@/components/admin/page-header";
import { Stat } from "@/components/admin/stat-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Megaphone, Wallet, MousePointerClick, Target, Trash2 } from "lucide-react";
import { type AdSpend, type Order, AD_PLATFORMS } from "@/lib/admin-types";

export const Route = createFileRoute("/admin/ad-spending")({
  ssr: false,
  component: AdSpendingPage,
});

const RANGES = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
];

function AdSpendingPage() {
  const [entries, setEntries] = useState<AdSpend[]>([]);
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<Order[]>([]);
  const [rangeDays, setRangeDays] = useState(30);
  const [editing, setEditing] = useState<AdSpend | null>(null);

  const loadEntries = () =>
    supabase
      .from("ad_spend")
      .select("*")
      .order("spend_date", { ascending: false })
      .then(({ data, error }) => {
        if (error) toast.error(`Couldn't load ad spend: ${error.message}`);
        setEntries((data as AdSpend[]) ?? []);
        setLoading(false);
      });

  useEffect(() => {
    loadEntries();
    supabase
      .from("orders")
      .select("*")
      .then(({ data, error }) => {
        if (error) return; // revenue tie-in is a bonus stat, not critical path
        setOrders((data as Order[]) ?? []);
      });
  }, []);

  const cutoff = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - rangeDays + 1);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [rangeDays]);

  const inRange = entries.filter((e) => new Date(e.spend_date) >= cutoff);
  const totalSpend = inRange.reduce((s, e) => s + Number(e.amount), 0);
  const totalClicks = inRange.reduce((s, e) => s + Number(e.clicks ?? 0), 0);
  const totalConversions = inRange.reduce((s, e) => s + Number(e.conversions ?? 0), 0);
  const cpc = totalClicks ? totalSpend / totalClicks : null;
  const cpa = totalConversions ? totalSpend / totalConversions : null;

  // Revenue tie-in: total order revenue (non-cancelled) over the same window,
  // for a rough ROAS. This is store-wide revenue, not strictly attributed to
  // ads — treat it as a directional signal, not a precise attribution model.
  const revenueInRange = orders
    .filter((o) => new Date(o.created_at) >= cutoff && o.status !== "cancelled")
    .reduce((s, o) => s + Number(o.total), 0);
  const roas = totalSpend ? revenueInRange / totalSpend : null;

  const totalAllTime = entries.reduce((s, e) => s + Number(e.amount), 0);

  const byPlatform = useMemo(() => {
    const map = new Map<string, number>();
    inRange.forEach((e) => map.set(e.platform, (map.get(e.platform) ?? 0) + Number(e.amount)));
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [inRange]);

  const save = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const payload = {
      platform: String(f.get("platform") || "").trim(),
      campaign_name: String(f.get("campaign_name") || "").trim() || null,
      amount: Number(f.get("amount")),
      spend_date: String(f.get("spend_date") || new Date().toISOString().slice(0, 10)),
      impressions: f.get("impressions") ? Number(f.get("impressions")) : null,
      clicks: f.get("clicks") ? Number(f.get("clicks")) : null,
      conversions: f.get("conversions") ? Number(f.get("conversions")) : null,
      notes: String(f.get("notes") || "").trim() || null,
    };
    if (!payload.platform) return toast.error("Platform is required");
    if (!isFinite(payload.amount) || payload.amount < 0) return toast.error("Enter a valid amount");

    if (editing) {
      const { error } = await supabase.from("ad_spend").update(payload).eq("id", editing.id);
      if (error) return toast.error(error.message);
      toast.success("Entry updated");
      setEditing(null);
    } else {
      const { error } = await supabase.from("ad_spend").insert(payload);
      if (error) return toast.error(error.message);
      toast.success("Ad spend logged");
      (e.currentTarget as HTMLFormElement).reset();
    }
    loadEntries();
  };

  const del = async (id: string) => {
    if (!confirm("Delete this entry?")) return;
    const { error } = await supabase.from("ad_spend").delete().eq("id", id);
    if (error) return toast.error(error.message);
    if (editing?.id === id) setEditing(null);
    loadEntries();
  };

  const rangePicker = (
    <div className="inline-flex rounded-md border bg-card p-0.5 text-xs">
      {RANGES.map((r) => (
        <button
          key={r.days}
          onClick={() => setRangeDays(r.days)}
          className={`px-3 py-1.5 rounded transition ${rangeDays === r.days ? "bg-accent text-accent-foreground" : "hover:bg-muted"}`}
        >
          {r.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Ad spending"
        description="What you're spending on ads, and what it's buying — separate from general business expenses."
        actions={rangePicker}
      />

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat
              label={`Spend (${rangeDays}d)`}
              value={`NRS ${totalSpend.toLocaleString()}`}
              icon={Wallet}
              tone="warn"
            />
            <Stat
              label="Est. ROAS"
              value={roas !== null ? `${roas.toFixed(2)}x` : "—"}
              icon={Target}
              tone="accent"
            />
            <Stat
              label="Cost per click"
              value={cpc !== null ? `NRS ${cpc.toFixed(1)}` : "—"}
              icon={MousePointerClick}
            />
            <Stat
              label="Cost per conversion"
              value={cpa !== null ? `NRS ${cpa.toFixed(0)}` : "—"}
              icon={Megaphone}
            />
          </div>
          <p className="text-xs text-muted-foreground -mt-3">
            ROAS compares ad spend against total store revenue for the same {rangeDays}-day window
            (NRS {revenueInRange.toLocaleString()}) — it's a directional signal, not per-order
            attribution. All-time spend logged: NRS {totalAllTime.toLocaleString()}.
          </p>

          <div className="grid lg:grid-cols-[1fr,1.4fr] gap-6">
            <Card className="shadow-sm h-fit">
              <CardHeader className="pb-3">
                <CardTitle className="font-display text-xl">
                  {editing ? "Edit entry" : "Log ad spend"}
                </CardTitle>
                <CardDescription>
                  {editing ? "Update this entry." : "Record what you spent on a platform/campaign."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={save} className="space-y-3" key={editing?.id ?? "new"}>
                  <div>
                    <Label>Platform</Label>
                    <Select name="platform" defaultValue={editing?.platform ?? AD_PLATFORMS[0]}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {AD_PLATFORMS.map((p) => (
                          <SelectItem key={p} value={p}>
                            {p}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Campaign name (optional)</Label>
                    <Input
                      name="campaign_name"
                      defaultValue={editing?.campaign_name ?? ""}
                      placeholder="e.g. Eid sale boost"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label>Amount (NRS)</Label>
                      <Input
                        name="amount"
                        type="number"
                        step="0.01"
                        min="0"
                        required
                        defaultValue={editing?.amount ?? ""}
                      />
                    </div>
                    <div>
                      <Label>Date</Label>
                      <Input
                        name="spend_date"
                        type="date"
                        required
                        defaultValue={editing?.spend_date ?? new Date().toISOString().slice(0, 10)}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label>Impressions</Label>
                      <Input
                        name="impressions"
                        type="number"
                        min="0"
                        defaultValue={editing?.impressions ?? ""}
                      />
                    </div>
                    <div>
                      <Label>Clicks</Label>
                      <Input
                        name="clicks"
                        type="number"
                        min="0"
                        defaultValue={editing?.clicks ?? ""}
                      />
                    </div>
                    <div>
                      <Label>Conversions</Label>
                      <Input
                        name="conversions"
                        type="number"
                        min="0"
                        defaultValue={editing?.conversions ?? ""}
                      />
                    </div>
                  </div>
                  <div>
                    <Label>Notes</Label>
                    <Input
                      name="notes"
                      defaultValue={editing?.notes ?? ""}
                      placeholder="Optional"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button>{editing ? "Save changes" : "Add entry"}</Button>
                    {editing && (
                      <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                        Cancel
                      </Button>
                    )}
                  </div>
                </form>
              </CardContent>
            </Card>

            <div className="space-y-6">
              {byPlatform.length > 0 && (
                <Card className="shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Spend by platform ({rangeDays}d)</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {byPlatform.map(([platform, amount]) => (
                      <div key={platform} className="flex items-center gap-3 text-sm">
                        <span className="w-28 truncate">{platform}</span>
                        <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full bg-accent"
                            style={{ width: `${totalSpend ? (amount / totalSpend) * 100 : 0}%` }}
                          />
                        </div>
                        <span className="tabular-nums text-muted-foreground w-24 text-right">
                          NRS {amount.toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              <Card className="shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="font-display text-xl">All entries</CardTitle>
                  <CardDescription>
                    {entries.length} {entries.length === 1 ? "entry" : "entries"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y border-t">
                    {entries.map((e) => (
                      <div
                        key={e.id}
                        className="p-3 flex items-center gap-3 hover:bg-muted/30 transition"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">
                            {e.platform}
                            {e.campaign_name && (
                              <span className="text-muted-foreground"> · {e.campaign_name}</span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {new Date(e.spend_date).toLocaleDateString()}
                            {e.clicks ? ` · ${e.clicks} clicks` : ""}
                            {e.conversions ? ` · ${e.conversions} conv.` : ""}
                          </div>
                        </div>
                        <div className="tabular-nums font-medium whitespace-nowrap">
                          NRS {Number(e.amount).toLocaleString()}
                        </div>
                        <Button size="sm" variant="outline" onClick={() => setEditing(e)}>
                          Edit
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => del(e.id)}>
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    ))}
                    {entries.length === 0 && (
                      <div className="p-10 text-center text-sm text-muted-foreground">
                        No ad spend logged yet.
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
