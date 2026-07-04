import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AdminPageHeader } from "@/components/admin/page-header";
import {
  DollarSign, ShoppingCart, Package, TrendingUp,
  Download, CheckCircle2, CalendarDays, Filter,
} from "lucide-react";
import { type Order } from "@/lib/admin-types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/sales-report")({
  ssr: false,
  component: SalesReportPage,
});

type PresetKey = "today" | "7d" | "30d" | "this_month" | "last_month" | "custom";

const PRESETS: { key: PresetKey; label: string }[] = [
  { key: "today",      label: "Today" },
  { key: "7d",         label: "7 days" },
  { key: "30d",        label: "30 days" },
  { key: "this_month", label: "This month" },
  { key: "last_month", label: "Last month" },
  { key: "custom",     label: "Custom" },
];

const STATUS_META: Record<string, { label: string; dot: string }> = {
  pending:   { label: "Pending",   dot: "bg-amber-400" },
  submitted: { label: "Submitted", dot: "bg-blue-500" },
  shipped:   { label: "Shipped",   dot: "bg-violet-500" },
  delivered: { label: "Delivered", dot: "bg-emerald-500" },
  cancelled: { label: "Cancelled", dot: "bg-red-500" },
};

function presetRange(preset: PresetKey, customStart: string, customEnd: string) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let start: Date;
  let end: Date = new Date(startOfToday);
  end.setHours(23, 59, 59, 999);

  switch (preset) {
    case "today":
      start = startOfToday; break;
    case "7d":
      start = new Date(startOfToday); start.setDate(start.getDate() - 6); break;
    case "30d":
      start = new Date(startOfToday); start.setDate(start.getDate() - 29); break;
    case "this_month":
      start = new Date(now.getFullYear(), now.getMonth(), 1); break;
    case "last_month":
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      end = new Date(now.getFullYear(), now.getMonth(), 0);
      end.setHours(23, 59, 59, 999); break;
    case "custom":
      start = customStart ? new Date(customStart) : startOfToday;
      end   = customEnd   ? new Date(customEnd)   : end;
      end.setHours(23, 59, 59, 999); break;
    default:
      start = startOfToday;
  }
  return { start, end };
}

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows
    .map((row) => row.map((cell) => {
      const s = String(cell ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function nrs(n: number) {
  return `NRS ${n.toLocaleString("en-NP", { maximumFractionDigits: 0 })}`;
}

// ─── Metric card ─────────────────────────────────────────────────────────────
function MetricCard({
  label, value, sub, icon: Icon, accent,
}: {
  label: string; value: string; sub?: string;
  icon: React.ComponentType<{ className?: string }>; accent?: string;
}) {
  return (
    <div className="bg-card border border-border/60 rounded-2xl p-5 flex flex-col gap-4 hover:border-border transition-colors">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground tracking-wide uppercase">{label}</span>
        <div className={cn("size-9 rounded-xl grid place-items-center", accent ?? "bg-muted")}>
          <Icon className="size-4" />
        </div>
      </div>
      <div>
        <div className="text-2xl font-display font-light tracking-tight leading-none">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-1.5">{sub}</div>}
      </div>
    </div>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────
function Section({ title, sub, children, action }: {
  title: string; sub?: string; children: React.ReactNode; action?: React.ReactNode;
}) {
  return (
    <div className="bg-card border border-border/60 rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border/40">
        <div>
          <h3 className="text-sm font-medium">{title}</h3>
          {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function Empty({ cols }: { cols: number }) {
  return (
    <tr>
      <td colSpan={cols} className="text-center text-sm text-muted-foreground py-12">
        No sales in this date range
      </td>
    </tr>
  );
}

// ─── Table primitives ─────────────────────────────────────────────────────────
function TH({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={cn("px-5 py-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground bg-muted/30 border-b border-border/40", right && "text-right")}>
      {children}
    </th>
  );
}
function TD({ children, right, mono, muted }: { children: React.ReactNode; right?: boolean; mono?: boolean; muted?: boolean }) {
  return (
    <td className={cn("px-5 py-3.5 text-sm border-b border-border/30 last:border-0", right && "text-right", mono && "tabular-nums font-mono text-xs", muted && "text-muted-foreground")}>
      {children}
    </td>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
function SalesReportPage() {
  const [orders, setOrders]             = useState<Order[]>([]);
  const [loading, setLoading]           = useState(true);
  const [preset, setPreset]             = useState<PresetKey>("30d");
  const [customStart, setCustomStart]   = useState("");
  const [customEnd, setCustomEnd]       = useState("");
  const [excludeCancelled, setExclude]  = useState(true);

  useEffect(() => {
    supabase.from("orders").select("*").order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) toast.error(`Couldn't load orders: ${error.message}`);
        setOrders((data as Order[]) ?? []);
        setLoading(false);
      });
  }, []);

  const { start, end } = useMemo(
    () => presetRange(preset, customStart, customEnd),
    [preset, customStart, customEnd],
  );

  const inRange = useMemo(
    () => orders.filter((o) => {
      const d = new Date(o.created_at);
      return d >= start && d <= end && (!excludeCancelled || o.status !== "cancelled");
    }),
    [orders, start, end, excludeCancelled],
  );

  const netProfit   = inRange.reduce((s, o) => s + Number(o.total), 0);
  const units       = inRange.reduce((s, o) => s + Number(o.quantity), 0);
  const aov         = inRange.length ? netProfit / inRange.length : 0;
  const delivered   = inRange.filter((o) => o.status === "delivered").length;
  const deliveredRate = inRange.length ? (delivered / inRange.length) * 100 : 0;

  const byDay = useMemo(() => {
    const map = new Map<string, { orders: number; units: number; profit: number }>();
    inRange.forEach((o) => {
      const key = new Date(o.created_at).toLocaleDateString("en-NP", { day: "numeric", month: "short", year: "numeric" });
      const cur = map.get(key) ?? { orders: 0, units: 0, profit: 0 };
      cur.orders += 1; cur.units += Number(o.quantity); cur.profit += Number(o.total);
      map.set(key, cur);
    });
    return [...map.entries()]
      .map(([date, v]) => ({ date, ...v }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [inRange]);

  const maxDayProfit = Math.max(...byDay.map((d) => d.profit), 1);

  const byProduct = useMemo(() => {
    const map = new Map<string, { units: number; profit: number; orders: number }>();
    inRange.forEach((o) => {
      const cur = map.get(o.product_name) ?? { units: 0, profit: 0, orders: 0 };
      cur.units += Number(o.quantity); cur.profit += Number(o.total); cur.orders += 1;
      map.set(o.product_name, cur);
    });
    return [...map.entries()]
      .map(([name, v]) => ({ name, ...v, share: netProfit ? (v.profit / netProfit) * 100 : 0 }))
      .sort((a, b) => b.profit - a.profit);
  }, [inRange, netProfit]);

  const byStatus = useMemo(() => {
    const map = new Map<string, { count: number; profit: number }>();
    inRange.forEach((o) => {
      const cur = map.get(o.status) ?? { count: 0, profit: 0 };
      cur.count += 1; cur.profit += Number(o.total);
      map.set(o.status, cur);
    });
    return [...map.entries()].map(([status, v]) => ({ status, ...v }))
      .sort((a, b) => b.count - a.count);
  }, [inRange]);

  const exportOrders = () => {
    const rows: (string | number)[][] = [
      ["Date", "Product", "Color", "Size", "Qty", "Total", "Customer", "Phone", "Status"],
      ...inRange.map((o) => [
        new Date(o.created_at).toLocaleString(),
        o.product_name, o.color ?? "", o.size ?? "", o.quantity,
        o.total, o.customer_name, o.customer_phone, o.status,
      ]),
    ];
    downloadCsv(`sales-report_${start.toISOString().slice(0, 10)}_${end.toISOString().slice(0, 10)}.csv`, rows);
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Sales report"
        description="Detailed, exportable sales figures for a chosen date range."
      />

      {/* ── Controls ─────────────────────────────────────────────────────── */}
      <div className="bg-card border border-border/60 rounded-2xl p-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
          <CalendarDays className="size-3.5" /> Range
        </div>
        <div className="inline-flex rounded-xl border border-border/60 bg-muted/30 p-0.5 text-xs gap-0.5">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPreset(p.key)}
              className={cn(
                "px-3.5 py-1.5 rounded-lg font-medium transition-all duration-150",
                preset === p.key
                  ? "bg-foreground text-background shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        {preset === "custom" && (
          <div className="flex items-center gap-2 text-xs">
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="rounded-lg border border-border/60 bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-foreground/20"
            />
            <span className="text-muted-foreground">→</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="rounded-lg border border-border/60 bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-foreground/20"
            />
          </div>
        )}

        <div className="flex items-center gap-2 ml-auto">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
            <Filter className="size-3" />
            <input
              type="checkbox"
              checked={excludeCancelled}
              onChange={(e) => setExclude(e.target.checked)}
              className="size-3 rounded"
            />
            Exclude cancelled
          </label>
          <button
            onClick={exportOrders}
            disabled={inRange.length === 0}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg border border-border/60 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-border transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download className="size-3.5" /> Export CSV
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24 text-muted-foreground text-sm">
          Loading…
        </div>
      ) : (
        <>
          {/* ── Metrics ──────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <MetricCard
              label="Net profit"
              value={nrs(netProfit)}
              sub={`${inRange.length} orders`}
              icon={DollarSign}
              accent="bg-emerald-500/10 text-emerald-600"
            />
            <MetricCard
              label="Orders"
              value={String(inRange.length)}
              icon={ShoppingCart}
              accent="bg-accent/10 text-accent"
            />
            <MetricCard
              label="Units sold"
              value={String(units)}
              icon={Package}
              accent="bg-violet-500/10 text-violet-600"
            />
            <MetricCard
              label="Avg order value"
              value={nrs(aov)}
              icon={TrendingUp}
              accent="bg-amber-500/10 text-amber-600"
            />
            <MetricCard
              label="Delivered rate"
              value={`${deliveredRate.toFixed(0)}%`}
              sub={`${delivered} of ${inRange.length}`}
              icon={CheckCircle2}
              accent="bg-blue-500/10 text-blue-600"
            />
          </div>

          {/* ── By day ───────────────────────────────────────────────────── */}
          <Section
            title="Net profit by day"
            sub={`${byDay.length} day${byDay.length !== 1 ? "s" : ""} with sales`}
          >
            <table className="w-full">
              <thead>
                <tr>
                  <TH>Date</TH>
                  <TH right>Orders</TH>
                  <TH right>Units</TH>
                  <TH right>Net profit</TH>
                  <TH>Trend</TH>
                </tr>
              </thead>
              <tbody>
                {byDay.length === 0 ? <Empty cols={5} /> : byDay.map((d) => (
                  <tr key={d.date} className="hover:bg-muted/20 transition-colors group">
                    <TD>{d.date}</TD>
                    <TD right mono>{d.orders}</TD>
                    <TD right mono>{d.units}</TD>
                    <TD right mono>{nrs(d.profit)}</TD>
                    <td className="px-5 py-3.5 border-b border-border/30 last:border-0 w-32">
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full transition-all"
                          style={{ width: `${(d.profit / maxDayProfit) * 100}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          {/* ── By product & By status ───────────────────────────────────── */}
          <div className="grid lg:grid-cols-2 gap-4">
            <Section title="By product" sub="Sorted by net profit share">
              <table className="w-full">
                <thead>
                  <tr>
                    <TH>Product</TH>
                    <TH right>Units</TH>
                    <TH right>Net profit</TH>
                    <TH right>Share</TH>
                  </tr>
                </thead>
                <tbody>
                  {byProduct.length === 0 ? <Empty cols={4} /> : byProduct.map((p, i) => (
                    <tr key={p.name} className="hover:bg-muted/20 transition-colors">
                      <td className="px-5 py-3.5 text-sm border-b border-border/30 last:border-0">
                        <div className="flex items-center gap-2.5">
                          <span className="text-[10px] font-mono text-muted-foreground w-4 shrink-0">
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          <span className="truncate max-w-35">{p.name}</span>
                        </div>
                      </td>
                      <TD right mono>{p.units}</TD>
                      <TD right mono>{nrs(p.profit)}</TD>
                      <td className="px-5 py-3.5 border-b border-border/30 last:border-0 w-28">
                        <div className="flex items-center gap-2 justify-end">
                          <span className="text-xs tabular-nums text-muted-foreground">{p.share.toFixed(1)}%</span>
                          <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-accent rounded-full" style={{ width: `${p.share}%` }} />
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>

            <Section title="By status" sub="Order outcomes in range">
              <table className="w-full">
                <thead>
                  <tr>
                    <TH>Status</TH>
                    <TH right>Orders</TH>
                    <TH right>Net profit</TH>
                    <TH right>%</TH>
                  </tr>
                </thead>
                <tbody>
                  {byStatus.length === 0 ? <Empty cols={4} /> : byStatus.map((s) => {
                    const meta = STATUS_META[s.status];
                    const pct = inRange.length ? (s.count / inRange.length) * 100 : 0;
                    return (
                      <tr key={s.status} className="hover:bg-muted/20 transition-colors">
                        <td className="px-5 py-3.5 text-sm border-b border-border/30 last:border-0">
                          <div className="flex items-center gap-2">
                            <span className={cn("size-2 rounded-full shrink-0", meta?.dot ?? "bg-muted-foreground")} />
                            {meta?.label ?? s.status}
                          </div>
                        </td>
                        <TD right mono>{s.count}</TD>
                        <TD right mono>{nrs(s.profit)}</TD>
                        <td className="px-5 py-3.5 border-b border-border/30 last:border-0 w-24">
                          <div className="flex items-center gap-2 justify-end">
                            <span className="text-xs tabular-nums text-muted-foreground">{pct.toFixed(0)}%</span>
                            <div className="w-10 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className={cn("h-full rounded-full", meta?.dot ?? "bg-muted-foreground")}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Section>
          </div>
        </>
      )}
    </div>
  );
}
