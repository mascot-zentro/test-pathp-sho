import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { lookupOrdersByPhone } from "@/lib/pathao.functions";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Package, Truck, CheckCircle2, Clock, XCircle, ChevronDown, ChevronUp } from "lucide-react";

export const Route = createFileRoute("/track")({
  component: TrackPage,
});

type OrderRow = {
  id: string;
  product_name: string;
  color: string | null;
  size: string | null;
  quantity: number;
  total: number;
  status: string;
  pathao_consignment_id: string | null;
  pathao_status: string | null;
  order_group_id: string | null;
  created_at: string;
  delivery_fee: number;
  discount_amount: number;
  promo_code: string | null;
};

type OrderGroup = {
  groupId: string;
  rows: OrderRow[];
  consignmentId: string | null;
  pathaoStatus: string | null;
  status: string;
  createdAt: string;
  groupTotal: number;
};

function buildGroups(rows: OrderRow[]): OrderGroup[] {
  const map = new Map<string, OrderRow[]>();
  for (const r of rows) {
    const key = r.order_group_id ?? r.id;
    const arr = map.get(key) ?? [];
    arr.push(r);
    map.set(key, arr);
  }
  return Array.from(map.entries()).map(([groupId, items]) => {
    const rep = items[0];
    return {
      groupId,
      rows: items,
      consignmentId: rep.pathao_consignment_id,
      pathaoStatus: rep.pathao_status,
      status: rep.status,
      createdAt: rep.created_at,
      groupTotal: items.reduce((s, r) => s + Number(r.total), 0),
    };
  });
}

const STATUS_STEPS = ["pending", "submitted", "shipped", "delivered"] as const;

function statusStep(status: string): number {
  const idx = STATUS_STEPS.indexOf(status as typeof STATUS_STEPS[number]);
  return idx === -1 ? (status === "cancelled" ? -1 : 0) : idx;
}

function StatusPill({ status, pathaoStatus }: { status: string; pathaoStatus: string | null }) {
  const s = status.toLowerCase();
  if (s === "cancelled") return (
    <Badge variant="destructive" className="capitalize font-medium text-xs">Cancelled</Badge>
  );
  if (s === "delivered") return (
    <Badge className="bg-emerald-500/15 text-emerald-700 border-transparent font-medium text-xs">Delivered</Badge>
  );
  if (s === "shipped") return (
    <Badge className="bg-violet-500/12 text-violet-700 border-transparent font-medium text-xs">Shipped</Badge>
  );
  if (s === "submitted") return (
    <Badge className="bg-blue-500/12 text-blue-700 border-transparent font-medium text-xs">With Courier</Badge>
  );
  return (
    <Badge variant="outline" className="font-medium text-xs text-muted-foreground">Processing</Badge>
  );
}

function ProgressBar({ status }: { status: string }) {
  const step = statusStep(status);
  if (step === -1) return null; // cancelled — don't show progress
  const labels = ["Processing", "With courier", "Shipped", "Delivered"];
  const icons = [Clock, Truck, Package, CheckCircle2];
  return (
    <div className="flex items-start gap-0 mt-4">
      {STATUS_STEPS.map((_, i) => {
        const Icon = icons[i];
        const done = i <= step;
        const isLast = i === STATUS_STEPS.length - 1;
        return (
          <div key={i} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1 shrink-0">
              <div className={`size-7 rounded-full grid place-items-center transition-colors ${done ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground/40"}`}>
                <Icon className="size-3.5" />
              </div>
              <span className={`text-[10px] leading-tight text-center w-14 ${done ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                {labels[i]}
              </span>
            </div>
            {!isLast && (
              <div className={`h-px flex-1 mx-1 mb-4 transition-colors ${i < step ? "bg-accent" : "bg-border"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function OrderCard({ group }: { group: OrderGroup }) {
  const [expanded, setExpanded] = useState(false);
  const multiItem = group.rows.length > 1;

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <StatusPill status={group.status} pathaoStatus={group.pathaoStatus} />
            {multiItem && (
              <span className="text-[10px] bg-muted text-muted-foreground rounded-full px-2 py-0.5">
                {group.rows.length} items · 1 parcel
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1.5">
            {new Date(group.createdAt).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-muted-foreground">Total</p>
          <p className="font-bold tabular-nums">NRS {group.groupTotal.toLocaleString()}</p>
        </div>
      </div>

      {/* Progress */}
      <div className="px-5 pb-2">
        <ProgressBar status={group.status} />
        {group.status === "cancelled" && (
          <div className="flex items-center gap-2 py-2 text-sm text-destructive">
            <XCircle className="size-4 shrink-0" />
            This order was cancelled.
          </div>
        )}
      </div>

      {/* Pathao consignment */}
      {group.consignmentId && (
        <div className="mx-5 mb-4 flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2.5">
          <Truck className="size-3.5 text-accent shrink-0" />
          <div>
            <p className="text-[11px] text-muted-foreground">Pathao consignment</p>
            <p className="text-xs font-mono font-medium">{group.consignmentId}</p>
          </div>
          {group.pathaoStatus && (
            <Badge variant="outline" className="ml-auto text-[10px] capitalize font-medium">
              {group.pathaoStatus.replace(/_/g, " ")}
            </Badge>
          )}
        </div>
      )}

      {/* Items */}
      <div className="border-t">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between px-5 py-3 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          {multiItem ? `${group.rows.length} items in this order` : group.rows[0].product_name}
          {multiItem && (expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />)}
        </button>

        {(multiItem ? expanded : true) && (
          <div className="px-5 pb-4 space-y-2">
            {group.rows.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <span className="font-medium">{r.product_name}</span>
                  {(r.color || r.size) && (
                    <span className="text-muted-foreground text-xs ml-1.5">
                      {[r.color, r.size].filter(Boolean).join(", ")}
                    </span>
                  )}
                </div>
                <span className="text-muted-foreground text-xs shrink-0">× {r.quantity}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TrackPage() {
  const [phone, setPhone] = useState("");
  const [groups, setGroups] = useState<OrderGroup[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const runLookup = useServerFn(lookupOrdersByPhone);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = (await runLookup({ data: { phone: phone.trim() } })) as { rows: OrderRow[] };
      setGroups(buildGroups(res.rows));
      setSearched(true);
    } catch (e) {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background page-enter">
      <SiteNav />

      <main className="flex-1 container mx-auto px-6 py-16 max-w-2xl">
        {/* Header */}
        <div className="mb-10 text-center">
          <p className="text-xs tracking-[0.2em] uppercase text-accent mb-2">Order tracking</p>
          <h1 className="text-4xl font-display font-light mb-3">Track your order</h1>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            Enter the phone number you used at checkout to see your order status.
          </p>
        </div>

        {/* Search form */}
        <form onSubmit={handleSubmit} className="flex gap-2 mb-10">
          <Input
            type="tel"
            placeholder="e.g. 98XXXXXXXX"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="flex-1 h-11 text-sm rounded-xl"
          />
          <Button type="submit" disabled={loading || !phone.trim()} className="h-11 px-6 rounded-xl gap-2">
            <Search className="size-4" />
            {loading ? "Searching…" : "Track"}
          </Button>
        </form>

        {/* Error */}
        {error && (
          <p className="text-sm text-destructive text-center mb-6">{error}</p>
        )}

        {/* Results */}
        {searched && groups !== null && (
          <>
            {groups.length === 0 ? (
              <div className="py-16 flex flex-col items-center text-center gap-4">
                <div className="size-16 rounded-full bg-muted grid place-items-center">
                  <Package className="size-7 text-muted-foreground/40" />
                </div>
                <div>
                  <p className="font-display text-xl font-light mb-1">No orders found</p>
                  <p className="text-sm text-muted-foreground max-w-xs">
                    We couldn't find any orders for that number. Double-check you entered the same number used at checkout.
                  </p>
                </div>
                <Button asChild variant="outline" className="rounded-full mt-2">
                  <Link to="/">Browse the collection</Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-xs text-muted-foreground mb-4">
                  {groups.length} order{groups.length === 1 ? "" : "s"} found
                </p>
                {groups.map((g) => (
                  <OrderCard key={g.groupId} group={g} />
                ))}
              </div>
            )}
          </>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
