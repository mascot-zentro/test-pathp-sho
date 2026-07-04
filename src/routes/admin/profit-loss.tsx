/*
  Profit & Loss — Admin page
  ─────────────────────────────────────────────────────────────────────────────
  Data sources:
    • orders              → revenue (excl. cancelled)
    • expenses            → operating expenses by category
    • ad_spend            → marketing spend by platform
    • impact_fund_entries → social work / impact contributions

  ── Delivery fee policy ────────────────────────────────────────────────────
  Delivery fees are collected from the customer but paid entirely to the
  delivery company. They are a pass-through — zero net to Aavira.
  They must NOT appear as income anywhere on the P&L.

  ── Correct P&L formula ─────────────────────────────────────────────────────
  order.total         = product price (post-discount) + delivery_fee  (grand total charged)
  Sales revenue       = Σ (order.total - order.delivery_fee)   — Aavira's actual income
  Discounts given     = Σ order.discount_amount
  Pre-discount sales  = sales revenue + discounts given

  Operating expenses  = Σ expenses.amount
  Marketing expenses  = Σ ad_spend.amount
  Social work         = Σ impact_fund_entries.contribution_amount
  Total expenses      = operating + marketing + social work

  Operating profit    = sales revenue − operating expenses − marketing expenses
  Net profit          = sales revenue − total expenses
  Cash flow           = cumulative net profit (running total)
*/

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminPageHeader } from "@/components/admin/page-header";
import { cn } from "@/lib/utils";
import {
  Download, ChevronDown, Loader2, BarChart3, RefreshCw, Info,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/profit-loss")({
  ssr: false,
  component: ProfitLossPage,
});

// ─── Types ───────────────────────────────────────────────────────────────────

type Order = {
  id: string;
  created_at: string;
  total: number;               // grand total = product (post-discount) + delivery
  delivery_fee: number;
  discount_amount: number;     // discount already applied (deducted from total)
  status: string;
};

type Expense = {
  id: string;
  expense_date: string;
  amount: number;
  category: string | null;
  description: string;
};

type AdSpend = {
  id: string;
  spend_date: string;
  amount: number;
  platform: string;
  campaign_name: string | null;
};

type ImpactEntry = {
  id: string;
  month: number;
  year: number;
  total_revenue: number;
  contribution_amount: number | null;
  status: string;
};

type MonthRow = {
  key: string;
  label: string;
  year: number;
  month: number;
  // ── Income (delivery excluded — it's a pass-through to delivery company) ──
  salesRevenue: number;       // order.total − delivery_fee  (Aavira's actual income)
  discountsGiven: number;     // Σ discount_amount (value given away via promo codes)
  preDiscountSales: number;   // salesRevenue + discountsGiven (full-price equivalent)
  // ── Expenses ──────────────────────────────────────────────────────────────
  operatingExp: number;
  marketingExp: number;
  socialWork: number;
  totalExpenses: number;
  // ── Profit layers ─────────────────────────────────────────────────────────
  operatingProfit: number;    // salesRevenue − operatingExp − marketingExp (before social work)
  netProfit: number;          // salesRevenue − totalExpenses
  cashFlow: number;           // cumulative net profit (running total)
  // ── Meta ──────────────────────────────────────────────────────────────────
  orderCount: number;
};

type YearOption = number | "all";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function ym(date: string) {
  const d = new Date(date);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

function ymKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function fmt(n: number, compact = false) {
  if (compact && Math.abs(n) >= 1_000) {
    return `NPR ${(n / 1_000).toFixed(1)}k`;
  }
  return new Intl.NumberFormat("en-NP", {
    style: "currency", currency: "NPR", maximumFractionDigits: 0,
  }).format(n);
}

function pct(part: number, whole: number, places = 1) {
  if (!whole) return "—";
  return `${((part / whole) * 100).toFixed(places)}%`;
}

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows
    .map((r) => r.map((c) => {
      const s = String(c ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

// ─── Tooltip (2-second hover delay) ──────────────────────────────────────────

function Tooltip({ text, children }: { text: string; children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = () => { timerRef.current = setTimeout(() => setVisible(true), 2000); };
  const hide = () => { if (timerRef.current) clearTimeout(timerRef.current); setVisible(false); };

  return (
    <span className="relative inline-flex items-center gap-1 cursor-default" onMouseEnter={show} onMouseLeave={hide}>
      {children}
      {visible && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-56 rounded-xl border border-border bg-popover px-3 py-2.5 text-left text-[11px] leading-relaxed text-popover-foreground shadow-xl whitespace-normal pointer-events-none">
          {text}
          <span className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-border" />
        </span>
      )}
    </span>
  );
}

// ─── MetricCard ───────────────────────────────────────────────────────────────

function MetricCard({
  label, value, sub, accent, negative, warning, tooltip,
}: {
  label: string; value: string; sub?: string;
  accent?: boolean; negative?: boolean; warning?: boolean; tooltip?: string;
}) {
  return (
    <div className={cn(
      "rounded-2xl border px-5 py-5 space-y-1.5 transition-shadow hover:shadow-sm",
      accent && !negative && "border-emerald-200 bg-emerald-50/60",
      accent && negative && "border-red-200 bg-red-50/60",
      warning && "border-amber-200 bg-amber-50/40",
      !accent && !warning && "border-border bg-card",
    )}>
      <div className="flex items-center gap-1.5">
        <p className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">{label}</p>
        {tooltip && (
          <Tooltip text={tooltip}>
            <Info className="size-3 text-muted-foreground/40 shrink-0" />
          </Tooltip>
        )}
      </div>
      <p className={cn(
        "font-display text-2xl md:text-3xl font-light tracking-tight",
        accent && !negative && "text-emerald-700",
        accent && negative && "text-red-600",
        warning && "text-amber-700",
        !accent && !warning && "text-foreground",
      )}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

// ─── Table helpers ────────────────────────────────────────────────────────────

function TH({ children, right, tooltip }: {
  children: React.ReactNode; right?: boolean; tooltip?: string;
}) {
  return (
    <th className={cn(
      "px-3.5 py-3 text-[10px] uppercase tracking-widest font-semibold text-muted-foreground border-b border-border/60 whitespace-nowrap",
      right ? "text-right" : "text-left",
    )}>
      {tooltip ? (
        <Tooltip text={tooltip}>
          <span>{children}</span>
          <Info className="size-2.5 text-muted-foreground/40" />
        </Tooltip>
      ) : children}
    </th>
  );
}

function TD({ children, right, muted, accent, neg, mono, bold, amber, className }: {
  children: React.ReactNode; right?: boolean; muted?: boolean;
  accent?: boolean; neg?: boolean; mono?: boolean; bold?: boolean;
  amber?: boolean; className?: string;
}) {
  return (
    <td className={cn(
      "px-3.5 py-3.5 text-sm border-b border-border/20 whitespace-nowrap",
      right && "text-right",
      muted && "text-muted-foreground",
      accent && "text-emerald-700 font-medium",
      neg && "text-red-500",
      amber && "text-amber-600",
      mono && "tabular-nums",
      bold && "font-semibold",
      className,
    )}>
      {children}
    </td>
  );
}

function TrendBar({ value, max, negative }: { value: number; max: number; negative?: boolean }) {
  const w = max > 0 ? Math.min(100, (Math.abs(value) / max) * 100) : 0;
  return (
    <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
      <div
        className={cn("h-full rounded-full transition-all duration-500", negative ? "bg-red-400" : "bg-emerald-500")}
        style={{ width: `${w}%` }}
      />
    </div>
  );
}

// ─── Expanded row detail ───────────────────────────────────────────────────────

function Row({ label, value, bold, green, red, amber }: {
  label: string; value: string; bold?: boolean;
  green?: boolean; red?: boolean; amber?: boolean;
}) {
  return (
    <div className="flex justify-between items-baseline gap-4 text-xs py-0.5">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className={cn(
        "tabular-nums text-right",
        bold && "font-semibold",
        green && "text-emerald-700",
        red && "text-red-500",
        amber && "text-amber-600",
        !green && !red && !amber && "text-foreground",
      )}>{value}</span>
    </div>
  );
}

// ─── Cash Flow Chart ──────────────────────────────────────────────────────────

function CashFlowChart({ rows }: { rows: MonthRow[] }) {
  const [hovered, setHovered] = useState<string | null>(null);
  if (rows.length < 2) return null;

  const maxFlow = Math.max(...rows.map((r) => Math.abs(r.cashFlow)), 1);

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="mb-5">
        <p className="text-base font-semibold">Cumulative Cash Flow</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Running total of net profit over time — a growing bar means the business is building up profit. Hover each bar to see the exact amount.
        </p>
      </div>
      <div className="flex items-end gap-2 h-36 w-full">
        {rows.map((r) => {
          const heightPct = Math.min(100, (Math.abs(r.cashFlow) / maxFlow) * 100);
          const positive = r.cashFlow >= 0;
          const isHovered = hovered === r.key;
          return (
            <div
              key={r.key}
              className="flex-1 flex flex-col items-center gap-1.5 min-w-0"
              onMouseEnter={() => setHovered(r.key)}
              onMouseLeave={() => setHovered(null)}
            >
              <div className="w-full flex items-end justify-center relative" style={{ height: "120px" }}>
                {isHovered && (
                  <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-foreground text-background text-[11px] rounded-lg px-2.5 py-1.5 whitespace-nowrap z-10 pointer-events-none shadow-lg">
                    <span className="font-medium">{r.label}</span>
                    <br />
                    <span className="opacity-75">Cash flow: {fmt(r.cashFlow)}</span>
                    <br />
                    <span className="opacity-75">Net profit: {fmt(r.netProfit)}</span>
                  </div>
                )}
                <div
                  className={cn(
                    "w-full rounded-t-sm transition-all duration-300",
                    positive ? "bg-emerald-500" : "bg-red-400",
                    isHovered && "opacity-75",
                  )}
                  style={{ height: `${heightPct}%`, minHeight: "3px" }}
                />
              </div>
              <span className="text-[9px] text-muted-foreground/60 truncate w-full text-center hidden sm:block">
                {r.label.slice(0, 3)}
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-4 mt-4 pt-3 border-t border-border/40">
        <div className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-emerald-500" />
          <span className="text-[11px] text-muted-foreground">Positive (profit building up)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-red-400" />
          <span className="text-[11px] text-muted-foreground">Negative (cumulative loss)</span>
        </div>
      </div>
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

function ProfitLossPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [adSpends, setAdSpends] = useState<AdSpend[]>([]);
  const [impactEntries, setImpactEntries] = useState<ImpactEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedYear, setSelectedYear] = useState<YearOption>(new Date().getFullYear());
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);

  const load = async (showRefreshing = false) => {
    if (showRefreshing) setRefreshing(true);
    const db = supabase as any;
    const [o, e, a, i] = await Promise.all([
      db.from("orders")
        .select("id,created_at,total,delivery_fee,discount_amount,status")
        .not("status", "eq", "cancelled"),
      db.from("expenses").select("*"),
      db.from("ad_spend").select("*"),
      db.from("impact_fund_entries").select("*"),
    ]);
    if (o.data) setOrders(o.data);
    if (e.data) setExpenses(e.data);
    if (a.data) setAdSpends(a.data);
    if (i.data) setImpactEntries(i.data);
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => { load(); }, []);

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    orders.forEach((o) => years.add(new Date(o.created_at).getFullYear()));
    expenses.forEach((e) => years.add(new Date(e.expense_date).getFullYear()));
    adSpends.forEach((a) => years.add(new Date(a.spend_date).getFullYear()));
    impactEntries.forEach((i) => years.add(i.year));
    return Array.from(years).sort((a, b) => b - a);
  }, [orders, expenses, adSpends, impactEntries]);

  // ── Build month rows ──────────────────────────────────────────────────────

  const rows = useMemo<MonthRow[]>(() => {
    const keys = new Set<string>();
    const inYear = (dateStr: string) =>
      selectedYear === "all" || new Date(dateStr).getFullYear() === selectedYear;
    const inYearYM = (year: number) =>
      selectedYear === "all" || year === selectedYear;

    orders.forEach((o) => {
      if (inYear(o.created_at)) {
        const { year, month } = ym(o.created_at);
        keys.add(ymKey(year, month));
      }
    });
    expenses.forEach((e) => {
      if (inYear(e.expense_date)) {
        const { year, month } = ym(e.expense_date);
        keys.add(ymKey(year, month));
      }
    });
    adSpends.forEach((a) => {
      if (inYear(a.spend_date)) {
        const { year, month } = ym(a.spend_date);
        keys.add(ymKey(year, month));
      }
    });
    impactEntries.forEach((i) => {
      if (inYearYM(i.year)) keys.add(ymKey(i.year, i.month));
    });

    const rawRows: Omit<MonthRow, "cashFlow">[] = Array.from(keys).sort().map((key) => {
      const [y, m] = key.split("-").map(Number);

      const monthOrders = orders.filter((o) => {
        const d = ym(o.created_at);
        return d.year === y && d.month === m;
      });

      // ── Income calculations ──────────────────────────────────────────────
      // Delivery is a pass-through to delivery company — excluded from all P&L income.
      // order.total = product price (post-discount) + delivery_fee
      // Aavira's actual income = order.total − delivery_fee
      const salesRevenue = monthOrders.reduce(
        (a, o) => a + Number(o.total) - Number(o.delivery_fee ?? 0), 0
      );
      const discountsGiven = monthOrders.reduce((a, o) => a + Number(o.discount_amount ?? 0), 0);
      const preDiscountSales = salesRevenue + discountsGiven;

      // ── Expense calculations ─────────────────────────────────────────────
      const monthExpenses = expenses.filter((e) => {
        const d = ym(e.expense_date);
        return d.year === y && d.month === m;
      });
      const operatingExp = monthExpenses.reduce((a, e) => a + Number(e.amount), 0);

      const monthAds = adSpends.filter((a) => {
        const d = ym(a.spend_date);
        return d.year === y && d.month === m;
      });
      const marketingExp = monthAds.reduce((a, ad) => a + Number(ad.amount), 0);

      const impactEntry = impactEntries.find((i) => i.year === y && i.month === m);
      const socialWork = impactEntry ? Number(impactEntry.contribution_amount ?? 0) : 0;

      const totalExpenses = operatingExp + marketingExp + socialWork;
      const operatingProfit = salesRevenue - operatingExp - marketingExp;
      const netProfit = salesRevenue - totalExpenses;

      return {
        key,
        label: `${MONTH_NAMES[m - 1]} ${y}`,
        year: y, month: m,
        salesRevenue, discountsGiven, preDiscountSales,
        operatingExp, marketingExp, socialWork, totalExpenses,
        operatingProfit, netProfit,
        orderCount: monthOrders.length,
      };
    });

    // Cumulative cash flow (chronological order matters)
    let cumulative = 0;
    return rawRows.map((r) => {
      cumulative += r.netProfit;
      return { ...r, cashFlow: cumulative };
    });
  }, [orders, expenses, adSpends, impactEntries, selectedYear]);

  // ── Totals ───────────────────────────────────────────────────────────────

  const totals = useMemo(() => ({
    salesRevenue:     rows.reduce((a, r) => a + r.salesRevenue, 0),
    discountsGiven:   rows.reduce((a, r) => a + r.discountsGiven, 0),
    preDiscountSales: rows.reduce((a, r) => a + r.preDiscountSales, 0),
    operatingExp:     rows.reduce((a, r) => a + r.operatingExp, 0),
    marketingExp:     rows.reduce((a, r) => a + r.marketingExp, 0),
    socialWork:       rows.reduce((a, r) => a + r.socialWork, 0),
    totalExpenses:    rows.reduce((a, r) => a + r.totalExpenses, 0),
    operatingProfit:  rows.reduce((a, r) => a + r.operatingProfit, 0),
    netProfit:        rows.reduce((a, r) => a + r.netProfit, 0),
    orderCount:       rows.reduce((a, r) => a + r.orderCount, 0),
  }), [rows]);

  // ── Best / worst month ────────────────────────────────────────────────────

  const bestMonth = rows.reduce<MonthRow | null>(
    (best, r) => (!best || r.netProfit > best.netProfit) ? r : best, null
  );
  const worstMonth = rows.reduce<MonthRow | null>(
    (worst, r) => (!worst || r.netProfit < worst.netProfit) ? r : worst, null
  );

  // ── Category helpers for expanded rows ────────────────────────────────────

  function getMonthExpensesByCategory(year: number, month: number) {
    return expenses
      .filter((e) => { const d = ym(e.expense_date); return d.year === year && d.month === month; })
      .reduce<Record<string, number>>((acc, e) => {
        const cat = e.category || "Uncategorised";
        acc[cat] = (acc[cat] ?? 0) + Number(e.amount);
        return acc;
      }, {});
  }

  function getMonthAdsByPlatform(year: number, month: number) {
    return adSpends
      .filter((a) => { const d = ym(a.spend_date); return d.year === year && d.month === month; })
      .reduce<Record<string, number>>((acc, a) => {
        acc[a.platform] = (acc[a.platform] ?? 0) + Number(a.amount);
        return acc;
      }, {});
  }

  // ── CSV exports ───────────────────────────────────────────────────────────

  const exportCsv = () => {
    const header = [
      "Month", "Orders",
      "Pre-Discount Sales (NPR)", "Discounts Given (NPR)", "Sales Revenue (NPR)",
      "Operating Expenses (NPR)", "Marketing Expenses (NPR)", "Social Work (NPR)",
      "Total Expenses (NPR)", "Operating Profit (NPR)", "Net Profit (NPR)",
      "Cumulative Cash Flow (NPR)", "Net Profit Margin (%)",
    ];
    const dataRows = rows.map((r) => [
      r.label, r.orderCount,
      r.preDiscountSales, r.discountsGiven, r.salesRevenue,
      r.operatingExp, r.marketingExp, r.socialWork, r.totalExpenses,
      r.operatingProfit, r.netProfit, r.cashFlow,
      r.salesRevenue > 0 ? ((r.netProfit / r.salesRevenue) * 100).toFixed(1) : "0",
    ]);
    const totalsRow = [
      "TOTAL", totals.orderCount,
      totals.preDiscountSales, totals.discountsGiven, totals.salesRevenue,
      totals.operatingExp, totals.marketingExp, totals.socialWork, totals.totalExpenses,
      totals.operatingProfit, totals.netProfit, rows[rows.length - 1]?.cashFlow ?? 0,
      totals.salesRevenue > 0 ? ((totals.netProfit / totals.salesRevenue) * 100).toFixed(1) : "0",
    ];
    downloadCsv(
      `aavira-profit-loss-${selectedYear === "all" ? "all-time" : selectedYear}.csv`,
      [header, ...dataRows, totalsRow],
    );
    toast.success("Summary report downloaded");
  };

  const exportDetailed = () => {
    const rows2: (string | number)[][] = [
      ["Date", "Type", "Category / Platform", "Description", "Amount (NPR)"],
      ...orders
        .filter((o) => selectedYear === "all" || new Date(o.created_at).getFullYear() === selectedYear)
        .map((o) => [
          o.created_at.slice(0, 10), "Sales Revenue", "Orders",
          `Order ${o.id.slice(0, 8)} (discount: ${fmt(o.discount_amount ?? 0)}, delivery passed through: ${fmt(o.delivery_fee ?? 0)})`,
          Number(o.total) - Number(o.delivery_fee ?? 0),
        ]),
      ...expenses
        .filter((e) => selectedYear === "all" || new Date(e.expense_date).getFullYear() === selectedYear)
        .map((e) => [e.expense_date, "Expense", e.category || "Uncategorised", e.description, -e.amount]),
      ...adSpends
        .filter((a) => selectedYear === "all" || new Date(a.spend_date).getFullYear() === selectedYear)
        .map((a) => [a.spend_date, "Marketing", a.platform, a.campaign_name || "—", -a.amount]),
      ...impactEntries
        .filter((i) => selectedYear === "all" || i.year === selectedYear)
        .map((i) => [
          `${i.year}-${String(i.month).padStart(2, "0")}-01`,
          "Social Work", "Impact Fund",
          `${MONTH_NAMES[i.month - 1]} ${i.year} contribution`,
          -(i.contribution_amount ?? 0),
        ]),
    ];
    downloadCsv(
      `aavira-detailed-transactions-${selectedYear === "all" ? "all-time" : selectedYear}.csv`,
      rows2,
    );
    toast.success("Detailed report downloaded");
  };

  const maxNetProfit = Math.max(...rows.map((r) => Math.abs(r.netProfit)), 1);

  // ─── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-96 gap-3">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Loading financial data…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-16">
      <AdminPageHeader
        title="Profit & Loss"
        description="Every rupee earned and spent — month by month, fully detailed."
      />

      {/* ── Controls ────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground uppercase tracking-widest">Year</span>
          <div className="flex items-center gap-1">
            {(["all", ...availableYears] as (YearOption)[]).map((y) => (
              <button
                key={String(y)}
                onClick={() => setSelectedYear(y)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                  selectedYear === y
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted",
                )}
              >
                {y === "all" ? "All time" : y}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
            Refresh
          </button>
          <button
            onClick={exportDetailed}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted border border-border transition-colors"
          >
            <Download className="size-3.5" />
            Detailed CSV
          </button>
          <button
            onClick={exportCsv}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium bg-foreground text-background hover:bg-foreground/90 transition-colors"
          >
            <Download className="size-3.5" />
            Summary CSV
          </button>
        </div>
      </div>

      {/* ── Top summary cards (row 1) ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          label="Total Sales"
          value={fmt(totals.salesRevenue)}
          sub={`${totals.orderCount} orders`}
          tooltip="Aavira's actual income from product sales — delivery fees are excluded entirely because they go directly to the delivery company (pass-through)."
        />
        <MetricCard
          label="Pre-Discount Sales"
          value={fmt(totals.preDiscountSales)}
          sub={`After discounts: ${fmt(totals.salesRevenue, true)}`}
          tooltip="What customers would have paid at full price before any promo codes or discounts were applied."
        />
        <MetricCard
          label="Discounts Given"
          value={fmt(totals.discountsGiven)}
          sub={totals.preDiscountSales > 0 ? `${pct(totals.discountsGiven, totals.preDiscountSales)} of full-price sales` : "No discounts"}
          warning
          tooltip="Total value of promo codes and discounts applied by customers. This is money voluntarily given away — it reduces Aavira's actual income."
        />
        <MetricCard
          label="Total Expenses"
          value={fmt(totals.totalExpenses)}
          sub={`${pct(totals.totalExpenses, totals.salesRevenue)} of sales`}
          tooltip="All costs: operating + marketing/ads + social work. Delivery costs are NOT included here — they are a pass-through and not Aavira's expense."
        />
      </div>

      {/* ── Profit cards (row 2) ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          label="Social Work"
          value={fmt(totals.socialWork)}
          sub="Impact fund contributions"
          tooltip="Amount set aside for community and social impact causes — counted as an expense but tracked separately to highlight the social mission."
        />
        <MetricCard
          label="Operating Profit"
          value={fmt(totals.operatingProfit)}
          sub="Before social work deduction"
          accent
          negative={totals.operatingProfit < 0}
          tooltip="Sales Revenue minus operating costs and marketing/ads only — before deducting social work. Shows pure business profitability."
        />
        <MetricCard
          label="Net Profit"
          value={fmt(totals.netProfit)}
          sub={`Margin ${pct(totals.netProfit, totals.salesRevenue)}`}
          accent
          negative={totals.netProfit < 0}
          tooltip="Final bottom line after ALL expenses (operating + marketing + social work). Positive = profitable. Negative = spending more than earning."
        />
        <MetricCard
          label="Cumulative Cash Flow"
          value={fmt(rows[rows.length - 1]?.cashFlow ?? 0)}
          sub={`Over ${rows.length} month${rows.length !== 1 ? "s" : ""}`}
          accent
          negative={(rows[rows.length - 1]?.cashFlow ?? 0) < 0}
          tooltip="Running total of net profit since the start of the selected period. A growing number means the business is accumulating profit over time."
        />
      </div>

      {/* ── Stat strip ────────────────────────────────────────────────────────── */}
      {rows.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-2xl border border-border bg-card px-5 py-4 space-y-1">
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">Avg. Order Value</p>
            <p className="text-xl font-semibold tabular-nums">
              {totals.orderCount > 0 ? fmt(totals.salesRevenue / totals.orderCount) : "—"}
            </p>
            <p className="text-xs text-muted-foreground">Per completed order (excl. delivery)</p>
          </div>
          <div className="rounded-2xl border border-border bg-card px-5 py-4 space-y-1">
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">Avg. Profit / Month</p>
            <p className={cn("text-xl font-semibold tabular-nums", totals.netProfit >= 0 ? "text-emerald-700" : "text-red-500")}>
              {rows.length > 0 ? fmt(totals.netProfit / rows.length) : "—"}
            </p>
            <p className="text-xs text-muted-foreground">{rows.length} month{rows.length !== 1 ? "s" : ""} of data</p>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 px-5 py-4 space-y-1">
            <p className="text-[11px] uppercase tracking-widest text-emerald-700/70 font-semibold">Best Month</p>
            <p className="text-xl font-semibold text-emerald-700 tabular-nums">
              {bestMonth ? fmt(bestMonth.netProfit) : "—"}
            </p>
            <p className="text-xs text-emerald-700/60">{bestMonth?.label}</p>
          </div>
          <div className="rounded-2xl border border-red-200 bg-red-50/40 px-5 py-4 space-y-1">
            <p className="text-[11px] uppercase tracking-widest text-red-600/70 font-semibold">Worst Month</p>
            <p className="text-xl font-semibold text-red-600 tabular-nums">
              {worstMonth ? fmt(worstMonth.netProfit) : "—"}
            </p>
            <p className="text-xs text-red-600/60">{worstMonth?.label}</p>
          </div>
        </div>
      )}

      {/* ── Expense breakdown + income bar ────────────────────────────────────── */}
      <div className="grid md:grid-cols-2 gap-3">
        <div className="rounded-2xl border border-border bg-card px-5 py-5">
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold mb-1">Expense Breakdown</p>
          <p className="text-xs text-muted-foreground mb-4">Where every rupee of expenses goes</p>
          <div className="space-y-3.5">
            {[
              {
                label: "Operating Costs", value: totals.operatingExp, color: "bg-orange-400",
                tooltip: "Day-to-day running costs: supplies, packaging, rent, utilities, staff wages, etc. These are the costs of keeping the business running.",
              },
              {
                label: "Marketing / Ads", value: totals.marketingExp, color: "bg-blue-400",
                tooltip: "Money spent on advertising: Facebook, Instagram, Google, TikTok, etc. These costs drive customer awareness and sales.",
              },
              {
                label: "Social Work", value: totals.socialWork, color: "bg-violet-400",
                tooltip: "Monthly contribution to the Aavira impact fund — money set aside for community and social causes.",
              },
            ].map(({ label, value, color, tooltip }) => (
              <div key={label} className="flex items-center gap-3">
                <span className={cn("size-2.5 rounded-full shrink-0", color)} />
                <Tooltip text={tooltip}>
                  <span className="text-xs text-muted-foreground">{label}</span>
                  <Info className="size-3 text-muted-foreground/40" />
                </Tooltip>
                <span className="text-xs font-semibold tabular-nums ml-auto">{fmt(value, true)}</span>
                <span className="text-xs text-muted-foreground/50 w-12 text-right tabular-nums">
                  {pct(value, totals.totalExpenses)}
                </span>
                <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden shrink-0">
                  <div
                    className={cn("h-full rounded-full", color)}
                    style={{ width: `${totals.totalExpenses > 0 ? (value / totals.totalExpenses) * 100 : 0}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Income vs expenses bar */}
        <div className="rounded-2xl border border-border bg-card px-5 py-5">
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold mb-1">Income vs Expenses</p>
          <p className="text-xs text-muted-foreground mb-4">
            The bigger the green section, the more income you're keeping as profit
          </p>
          <div className="flex rounded-full overflow-hidden h-6 gap-px">
            {totals.salesRevenue > 0 && (
              <div
                className="bg-emerald-500 flex items-center justify-center transition-all duration-700"
                style={{ width: `${(totals.salesRevenue / (totals.salesRevenue + totals.totalExpenses)) * 100}%` }}
              >
                <span className="text-[9px] text-white font-semibold">
                  {((totals.salesRevenue / (totals.salesRevenue + totals.totalExpenses)) * 100).toFixed(0)}%
                </span>
              </div>
            )}
            {totals.totalExpenses > 0 && (
              <div
                className="bg-red-400 flex items-center justify-center transition-all duration-700"
                style={{ width: `${(totals.totalExpenses / (totals.salesRevenue + totals.totalExpenses)) * 100}%` }}
              >
                <span className="text-[9px] text-white font-semibold">
                  {((totals.totalExpenses / (totals.salesRevenue + totals.totalExpenses)) * 100).toFixed(0)}%
                </span>
              </div>
            )}
          </div>
          <div className="flex justify-between mt-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-emerald-500" />
              Sales Revenue {fmt(totals.salesRevenue, true)}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-red-400" />
              Expenses {fmt(totals.totalExpenses, true)}
            </span>
          </div>
          {/* Profit waterfall */}
          <div className="mt-4 pt-4 border-t border-border/40 space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Sales Revenue</span>
              <span className="font-medium tabular-nums text-emerald-700">{fmt(totals.salesRevenue)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">− Operating &amp; Marketing</span>
              <span className="tabular-nums text-red-500">−{fmt(totals.operatingExp + totals.marketingExp)}</span>
            </div>
            <div className="flex justify-between text-xs font-medium border-t border-border/30 pt-1.5">
              <span>= Operating Profit</span>
              <span className={cn("tabular-nums", totals.operatingProfit >= 0 ? "text-emerald-700" : "text-red-500")}>
                {fmt(totals.operatingProfit)}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">− Social Work</span>
              <span className="tabular-nums text-violet-600">−{fmt(totals.socialWork)}</span>
            </div>
            <div className="flex justify-between text-xs font-bold border-t border-border/30 pt-1.5">
              <span>= Net Profit</span>
              <span className={cn("tabular-nums", totals.netProfit >= 0 ? "text-emerald-700" : "text-red-500")}>
                {fmt(totals.netProfit)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Monthly P&L table ─────────────────────────────────────────────────── */}
      {rows.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card py-20 text-center">
          <BarChart3 className="size-10 text-muted-foreground/20 mx-auto mb-4" />
          <p className="text-sm font-medium text-muted-foreground">No financial data for this period</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Try selecting "All time" or a different year</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="px-6 py-4 border-b border-border/60 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">Monthly Statement</p>
              <p className="text-xs text-muted-foreground mt-0.5">Click any row to see a full breakdown for that month</p>
            </div>
            <span className="text-xs text-muted-foreground bg-muted px-2.5 py-1 rounded-full">
              {selectedYear === "all" ? "All time" : selectedYear} · {rows.length} month{rows.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-muted/30">
                  <TH>Month</TH>
                  <TH right tooltip="Number of completed (non-cancelled) orders">Orders</TH>
                  <TH right tooltip="Aavira's income from product sales after discounts. Delivery fees are excluded — they go to the delivery company, not Aavira.">Sales Revenue</TH>
                  <TH right tooltip="Operating costs + marketing/ads combined. The day-to-day cost of running the business.">Bus. Expenses</TH>
                  <TH right tooltip="Amount contributed to the social impact fund this month">Social Work</TH>
                  <TH right tooltip="Sales Revenue minus operating and marketing costs, before deducting social work. Shows core business profitability.">Op. Profit</TH>
                  <TH right tooltip="Final profit after ALL expenses (operating + marketing + social work). Green = profitable month. Red = loss.">Net Profit</TH>
                  <TH right tooltip="Net Profit ÷ Sales Revenue × 100. E.g., 97% means you kept 97p of every rupee of product sales.">Margin</TH>
                  <TH right tooltip="Running total of net profit from the start of the period. Grows each profitable month.">Cash Flow</TH>
                  <TH tooltip="Visual bar showing this month's net profit relative to all other months">Trend</TH>
                  <th className="px-3.5 py-3 border-b border-border/60 w-8" />
                </tr>
              </thead>
              <tbody>
                {[...rows].reverse().map((r) => {
                  const isExpanded = expandedMonth === r.key;
                  const margin = r.salesRevenue > 0 ? (r.netProfit / r.salesRevenue) * 100 : 0;
                  const expCats = getMonthExpensesByCategory(r.year, r.month);
                  const adPlats = getMonthAdsByPlatform(r.year, r.month);
                  const impactEntry = impactEntries.find((i) => i.year === r.year && i.month === r.month);
                  const busExp = r.operatingExp + r.marketingExp;

                  return (
                    <>
                      <tr
                        key={r.key}
                        className={cn(
                          "hover:bg-muted/20 transition-colors cursor-pointer",
                          isExpanded && "bg-muted/10",
                        )}
                        onClick={() => setExpandedMonth(isExpanded ? null : r.key)}
                      >
                        <TD bold>{r.label}</TD>
                        <TD right muted mono>{r.orderCount}</TD>
                        <TD right bold mono>{fmt(r.salesRevenue)}</TD>
                        <TD right mono neg={busExp > 0}>{busExp > 0 ? `−${fmt(busExp)}` : "—"}</TD>
                        <TD right muted mono>{r.socialWork > 0 ? `−${fmt(r.socialWork)}` : "—"}</TD>
                        <TD right mono accent={r.operatingProfit >= 0} neg={r.operatingProfit < 0}>
                          {fmt(r.operatingProfit)}
                        </TD>
                        <TD right mono accent={r.netProfit >= 0} neg={r.netProfit < 0} bold>
                          {fmt(r.netProfit)}
                        </TD>
                        <TD right muted>
                          <span className={cn("font-medium", margin >= 0 ? "text-emerald-600" : "text-red-500")}>
                            {margin.toFixed(1)}%
                          </span>
                        </TD>
                        <TD right mono bold>
                          <span className={r.cashFlow >= 0 ? "text-foreground" : "text-red-500"}>
                            {fmt(r.cashFlow)}
                          </span>
                        </TD>
                        <TD>
                          <TrendBar value={r.netProfit} max={maxNetProfit} negative={r.netProfit < 0} />
                        </TD>
                        <TD>
                          <ChevronDown className={cn(
                            "size-4 text-muted-foreground transition-transform duration-200",
                            isExpanded && "rotate-180",
                          )} />
                        </TD>
                      </tr>

                      {/* Expanded detail */}
                      {isExpanded && (
                        <tr key={`${r.key}-detail`} className="bg-muted/5">
                          <td colSpan={11} className="px-6 py-6 border-b border-border/30">
                            <div className="grid md:grid-cols-4 gap-6">

                              {/* Income detail */}
                              <div>
                                <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-3 flex items-center gap-1.5">
                                  <span className="size-2 rounded-full bg-emerald-500" />
                                  Income Detail
                                </p>
                                <Row label="Full-price sales (pre-discount)" value={fmt(r.preDiscountSales)} />
                                {r.discountsGiven > 0 && (
                                  <Row label="− Discounts / promos given" value={`−${fmt(r.discountsGiven)}`} amber />
                                )}
                                <div className="border-t border-border/40 pt-2 mt-2">
                                  <Row label="= Sales Revenue (Aavira's income)" value={fmt(r.salesRevenue)} bold green />
                                </div>
                                <p className="text-[10px] text-muted-foreground/60 italic pt-1">
                                  Delivery fees go to the delivery company — not counted as income
                                </p>
                                <Row label="Orders placed" value={String(r.orderCount)} />
                                {r.orderCount > 0 && (
                                  <Row label="Avg. per order" value={fmt(r.salesRevenue / r.orderCount)} />
                                )}
                              </div>

                              {/* Operating expenses */}
                              <div>
                                <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-3 flex items-center gap-1.5">
                                  <span className="size-2 rounded-full bg-orange-400" />
                                  Operating Costs
                                </p>
                                {Object.entries(expCats).length > 0 ? (
                                  Object.entries(expCats).map(([cat, amt]) => (
                                    <Row key={cat} label={cat} value={`−${fmt(amt)}`} red />
                                  ))
                                ) : (
                                  <p className="text-xs text-muted-foreground/50 italic">No operating expenses</p>
                                )}
                                {Object.entries(adPlats).length > 0 && (
                                  <>
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest pt-2 mt-1 font-medium">
                                      Marketing / Ads
                                    </p>
                                    {Object.entries(adPlats).map(([plat, amt]) => (
                                      <Row key={plat} label={plat} value={`−${fmt(amt)}`} red />
                                    ))}
                                  </>
                                )}
                                <div className="border-t border-border/40 pt-2 mt-2">
                                  <Row label="Total business expenses" value={`−${fmt(busExp)}`} bold red />
                                </div>
                              </div>

                              {/* Profit layers */}
                              <div>
                                <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-3 flex items-center gap-1.5">
                                  <span className="size-2 rounded-full bg-blue-500" />
                                  Profit Layers
                                </p>
                                <Row label="Sales Revenue" value={fmt(r.salesRevenue)} green />
                                <Row label="− Bus. expenses" value={`−${fmt(busExp)}`} red />
                                <div className="border-t border-border/40 pt-1.5 mt-1">
                                  <Row
                                    label="= Operating profit"
                                    value={fmt(r.operatingProfit)}
                                    bold
                                    green={r.operatingProfit >= 0}
                                    red={r.operatingProfit < 0}
                                  />
                                </div>
                                <Row label="− Social work" value={`−${fmt(r.socialWork)}`} amber />
                                <div className="border-t border-border/40 pt-1.5 mt-1">
                                  <Row
                                    label="= Net profit"
                                    value={fmt(r.netProfit)}
                                    bold
                                    green={r.netProfit >= 0}
                                    red={r.netProfit < 0}
                                  />
                                </div>
                                <Row
                                  label="Profit margin"
                                  value={`${margin.toFixed(1)}%`}
                                  green={margin >= 0}
                                  red={margin < 0}
                                />
                              </div>

                              {/* Social + cashflow */}
                              <div>
                                <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-3 flex items-center gap-1.5">
                                  <span className="size-2 rounded-full bg-violet-400" />
                                  Social &amp; Cash Flow
                                </p>
                                <Row label="Impact contribution" value={r.socialWork > 0 ? `−${fmt(r.socialWork)}` : "—"} />
                                {impactEntry && (
                                  <Row label="Contribution status" value={impactEntry.status} />
                                )}
                                <div className="border-t border-border/40 pt-2 mt-2">
                                  <Row
                                    label="Cumulative cash flow"
                                    value={fmt(r.cashFlow)}
                                    bold
                                    green={r.cashFlow >= 0}
                                    red={r.cashFlow < 0}
                                  />
                                </div>
                                {r.discountsGiven > 0 && (
                                  <Row label="Discounts given this month" value={fmt(r.discountsGiven)} amber />
                                )}
                                {/* Mini income vs expense bar */}
                                <div className="mt-3 pt-3 border-t border-border/30">
                                  <p className="text-[10px] text-muted-foreground mb-1.5">Income vs Expenses</p>
                                  <div className="flex rounded-full overflow-hidden h-2 gap-px">
                                    {r.salesRevenue > 0 && (
                                      <div
                                        className="bg-emerald-500"
                                        style={{ width: `${(r.salesRevenue / (r.salesRevenue + r.totalExpenses || 1)) * 100}%` }}
                                      />
                                    )}
                                    {r.totalExpenses > 0 && (
                                      <div
                                        className="bg-red-400"
                                        style={{ width: `${(r.totalExpenses / (r.grossIncome + r.totalExpenses || 1)) * 100}%` }}
                                      />
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>

              {/* Totals footer */}
              <tfoot>
                <tr className="bg-muted/50 border-t-2 border-border">
                  <td className="px-3.5 py-3.5 text-xs font-bold uppercase tracking-widest">Totals</td>
                  <td className="px-3.5 py-3.5 text-right text-xs font-semibold tabular-nums">{totals.orderCount}</td>
                  <td className="px-3.5 py-3.5 text-right text-xs font-bold tabular-nums">{fmt(totals.salesRevenue)}</td>
                  <td className="px-3.5 py-3.5 text-right text-xs tabular-nums text-red-500">
                    −{fmt(totals.operatingExp + totals.marketingExp)}
                  </td>
                  <td className="px-3.5 py-3.5 text-right text-xs tabular-nums text-muted-foreground">
                    −{fmt(totals.socialWork)}
                  </td>
                  <td className={cn(
                    "px-3.5 py-3.5 text-right text-xs font-semibold tabular-nums",
                    totals.operatingProfit >= 0 ? "text-emerald-700" : "text-red-500",
                  )}>{fmt(totals.operatingProfit)}</td>
                  <td className={cn(
                    "px-3.5 py-3.5 text-right text-xs font-bold tabular-nums",
                    totals.netProfit >= 0 ? "text-emerald-700" : "text-red-500",
                  )}>{fmt(totals.netProfit)}</td>
                  <td className={cn(
                    "px-3.5 py-3.5 text-right text-xs font-semibold",
                    totals.netProfit >= 0 ? "text-emerald-600" : "text-red-500",
                  )}>{pct(totals.netProfit, totals.salesRevenue)}</td>
                  <td className="px-3.5 py-3.5 text-right text-xs font-bold tabular-nums" colSpan={3}>
                    {fmt(rows[rows.length - 1]?.cashFlow ?? 0)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ── Cash flow chart ────────────────────────────────────────────────────── */}
      <CashFlowChart rows={rows} />

      {/* ── Glossary ──────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-muted/20 p-6">
        <p className="text-sm font-semibold mb-1">Glossary — What does each number mean?</p>
        <p className="text-xs text-muted-foreground mb-4">Plain-English explanations for every metric on this page</p>
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-4">
          {[
            { term: "Sales Revenue", def: "Aavira's actual income from product sales after discounts. Delivery fees are excluded — they go straight to the delivery company and are not Aavira's income at all." },
            { term: "Pre-Discount Sales", def: "What customers would have paid at full price before promo codes were applied. Sales Revenue + Discounts Given." },
            { term: "Discounts Given", def: "Total value of promo codes and discounts applied. This is money voluntarily given away — it reduces Aavira's income." },
            { term: "Delivery (excluded)", def: "Delivery fees are collected from customers and passed directly to the delivery company. They are NOT income for Aavira and do not appear anywhere on this P&L." },
            { term: "Operating Costs", def: "Day-to-day expenses: packaging, supplies, rent, wages, utilities — the cost of running the business." },
            { term: "Marketing / Ads", def: "Money spent on advertising (Facebook, Instagram, Google, etc.) to bring in customers." },
            { term: "Social Work", def: "Monthly amount contributed to the Aavira impact fund for community causes. Tracked separately." },
            { term: "Operating Profit", def: "Sales Revenue minus Operating + Marketing costs. Shows core business profitability before deducting social work." },
            { term: "Net Profit", def: "Final bottom line after ALL costs. Positive (green) = business made money. Negative (red) = spent more than earned." },
            { term: "Profit Margin %", def: "Net Profit ÷ Sales Revenue. E.g., 97% means you kept ₹97 of every ₹100 of product sales. Higher = healthier." },
            { term: "Cash Flow", def: "Cumulative (running total) of net profit. A rising number means the business is building up profit over time." },
          ].map(({ term, def }) => (
            <div key={term} className="space-y-0.5">
              <p className="text-xs font-semibold text-foreground">{term}</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{def}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
