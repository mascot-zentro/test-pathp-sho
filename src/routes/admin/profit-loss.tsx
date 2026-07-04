/*
  Profit & Loss — Admin page
  ─────────────────────────────────────────────────────────────────────────────
  Data sources (all existing tables):
    • orders         → gross revenue (total), delivery fees, discounts; status filter
    • expenses       → operating expenses by category
    • ad_spend       → marketing spend
    • impact_fund_entries → social work / impact contributions

  Month-by-month P&L statement with:
    Revenue         = sum of delivered/shipped order totals (excl. cancelled)
    Delivery income = sum of delivery_fee on those orders
    Gross income    = revenue + delivery income
    COGS            = (not tracked in DB — shown as 0 / manual override)
    Gross profit    = gross income − COGS
    Operating exp   = expenses table
    Marketing exp   = ad_spend table
    Social work     = impact_fund_entries contribution_amount
    Total expenses  = operating + marketing + social work
    Net profit      = gross profit − total expenses
    Cash flow       = cumulative net profit over selected window
*/

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminPageHeader } from "@/components/admin/page-header";
import { cn } from "@/lib/utils";
import {
  TrendingUp, TrendingDown, Minus, Download, ChevronDown,
  Loader2, BarChart3, RefreshCw,
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
  total: number;
  delivery_fee: number;
  discount_amount: number;
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
  key: string;       // "YYYY-MM"
  label: string;     // "Jan 2025"
  year: number;
  month: number;     // 1-12
  revenue: number;
  deliveryIncome: number;
  grossIncome: number;
  operatingExp: number;
  marketingExp: number;
  socialWork: number;
  totalExpenses: number;
  netProfit: number;
  cashFlow: number;  // cumulative
  orderCount: number;
};

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
    return `NPR ${(n / 1000).toFixed(1)}k`;
  }
  return new Intl.NumberFormat("en-NP", {
    style: "currency", currency: "NPR", maximumFractionDigits: 0,
  }).format(n);
}

function pct(part: number, whole: number) {
  if (!whole) return "—";
  return `${((part / whole) * 100).toFixed(1)}%`;
}

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows
    .map((r) => r.map((c) => {
      const s = String(c ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
    }).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

type YearOption = number | "all";

// ─── Sub-components ───────────────────────────────────────────────────────────

function Delta({ value, className }: { value: number; className?: string }) {
  if (value > 0) return <span className={cn("inline-flex items-center gap-0.5 text-emerald-600", className)}><TrendingUp className="size-3" />{fmt(value, true)}</span>;
  if (value < 0) return <span className={cn("inline-flex items-center gap-0.5 text-red-500", className)}><TrendingDown className="size-3" />{fmt(value, true)}</span>;
  return <span className={cn("inline-flex items-center gap-0.5 text-muted-foreground", className)}><Minus className="size-3" />—</span>;
}

function MetricCard({
  label, value, sub, accent, negative,
}: {
  label: string; value: string; sub?: string; accent?: boolean; negative?: boolean;
}) {
  return (
    <div className={cn(
      "rounded-xl border px-5 py-4 space-y-1",
      accent && !negative && "border-emerald-200 bg-emerald-50/60",
      accent && negative && "border-red-200 bg-red-50/60",
      !accent && "border-border bg-card",
    )}>
      <p className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium">{label}</p>
      <p className={cn(
        "font-display text-2xl font-light",
        accent && !negative && "text-emerald-700",
        accent && negative && "text-red-600",
        !accent && "text-foreground",
      )}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function TH({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={cn(
      "px-4 py-2.5 text-[10px] uppercase tracking-widest font-semibold text-muted-foreground border-b border-border/60 whitespace-nowrap",
      right ? "text-right" : "text-left",
    )}>
      {children}
    </th>
  );
}

function TD({ children, right, muted, accent, neg, mono, bold }: {
  children: React.ReactNode; right?: boolean; muted?: boolean;
  accent?: boolean; neg?: boolean; mono?: boolean; bold?: boolean;
}) {
  return (
    <td className={cn(
      "px-4 py-3 text-sm border-b border-border/30 whitespace-nowrap",
      right && "text-right",
      muted && "text-muted-foreground",
      accent && "text-emerald-700 font-medium",
      neg && "text-red-600",
      mono && "tabular-nums",
      bold && "font-semibold",
    )}>
      {children}
    </td>
  );
}

// Tiny inline bar
function Bar({ value, max, negative }: { value: number; max: number; negative?: boolean }) {
  const w = max > 0 ? Math.min(100, (Math.abs(value) / max) * 100) : 0;
  return (
    <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
      <div
        className={cn("h-full rounded-full transition-all duration-500", negative ? "bg-red-400" : "bg-emerald-500")}
        style={{ width: `${w}%` }}
      />
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
      db.from("orders").select("id,created_at,total,delivery_fee,discount_amount,status")
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

  // ── Build available years from data ────────────────────────────────────────
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    orders.forEach((o) => years.add(new Date(o.created_at).getFullYear()));
    expenses.forEach((e) => years.add(new Date(e.expense_date).getFullYear()));
    adSpends.forEach((a) => years.add(new Date(a.spend_date).getFullYear()));
    impactEntries.forEach((i) => years.add(i.year));
    return Array.from(years).sort((a, b) => b - a);
  }, [orders, expenses, adSpends, impactEntries]);

  // ── Build month-by-month rows ──────────────────────────────────────────────
  const rows = useMemo<MonthRow[]>(() => {
    // collect all months in scope
    const keys = new Set<string>();
    const inYear = (dateStr: string) => {
      if (selectedYear === "all") return true;
      return new Date(dateStr).getFullYear() === selectedYear;
    };
    const inYearYM = (year: number) => selectedYear === "all" || year === selectedYear;

    orders.forEach((o) => { if (inYear(o.created_at)) { const { year, month } = ym(o.created_at); keys.add(ymKey(year, month)); } });
    expenses.forEach((e) => { if (inYear(e.expense_date)) { const { year, month } = ym(e.expense_date); keys.add(ymKey(year, month)); } });
    adSpends.forEach((a) => { if (inYear(a.spend_date)) { const { year, month } = ym(a.spend_date); keys.add(ymKey(year, month)); } });
    impactEntries.forEach((i) => { if (inYearYM(i.year)) keys.add(ymKey(i.year, i.month)); });

    // For each month, accumulate
    const rawRows: Omit<MonthRow, "cashFlow">[] = Array.from(keys).sort().map((key) => {
      const [y, m] = key.split("-").map(Number);

      const monthOrders = orders.filter((o) => {
        const d = ym(o.created_at);
        return d.year === y && d.month === m;
      });
      const revenue = monthOrders.reduce((a, o) => a + o.total, 0);
      const deliveryIncome = monthOrders.reduce((a, o) => a + (o.delivery_fee ?? 0), 0);
      const grossIncome = revenue + deliveryIncome;

      const monthExpenses = expenses.filter((e) => {
        const d = ym(e.expense_date);
        return d.year === y && d.month === m;
      });
      const operatingExp = monthExpenses.reduce((a, e) => a + e.amount, 0);

      const monthAds = adSpends.filter((a) => {
        const d = ym(a.spend_date);
        return d.year === y && d.month === m;
      });
      const marketingExp = monthAds.reduce((a, ad) => a + ad.amount, 0);

      const impactEntry = impactEntries.find((i) => i.year === y && i.month === m);
      const socialWork = impactEntry
        ? (impactEntry.contribution_amount ?? 0)
        : 0;

      const totalExpenses = operatingExp + marketingExp + socialWork;
      const netProfit = grossIncome - totalExpenses;

      return {
        key,
        label: `${MONTH_NAMES[m - 1]} ${y}`,
        year: y,
        month: m,
        revenue,
        deliveryIncome,
        grossIncome,
        operatingExp,
        marketingExp,
        socialWork,
        totalExpenses,
        netProfit,
        orderCount: monthOrders.length,
      };
    });

    // cumulative cash flow
    let cumulative = 0;
    return rawRows.map((r) => {
      cumulative += r.netProfit;
      return { ...r, cashFlow: cumulative };
    });
  }, [orders, expenses, adSpends, impactEntries, selectedYear]);

  // ── Summary totals ─────────────────────────────────────────────────────────
  const totals = useMemo(() => ({
    revenue: rows.reduce((a, r) => a + r.revenue, 0),
    deliveryIncome: rows.reduce((a, r) => a + r.deliveryIncome, 0),
    grossIncome: rows.reduce((a, r) => a + r.grossIncome, 0),
    operatingExp: rows.reduce((a, r) => a + r.operatingExp, 0),
    marketingExp: rows.reduce((a, r) => a + r.marketingExp, 0),
    socialWork: rows.reduce((a, r) => a + r.socialWork, 0),
    totalExpenses: rows.reduce((a, r) => a + r.totalExpenses, 0),
    netProfit: rows.reduce((a, r) => a + r.netProfit, 0),
    orderCount: rows.reduce((a, r) => a + r.orderCount, 0),
  }), [rows]);

  // ── Category breakdown helpers (for expanded row) ─────────────────────────
  function getMonthExpensesByCategory(year: number, month: number) {
    return expenses
      .filter((e) => { const d = ym(e.expense_date); return d.year === year && d.month === month; })
      .reduce<Record<string, number>>((acc, e) => {
        const cat = e.category || "Uncategorised";
        acc[cat] = (acc[cat] ?? 0) + e.amount;
        return acc;
      }, {});
  }

  function getMonthAdsByPlatform(year: number, month: number) {
    return adSpends
      .filter((a) => { const d = ym(a.spend_date); return d.year === year && d.month === month; })
      .reduce<Record<string, number>>((acc, a) => {
        acc[a.platform] = (acc[a.platform] ?? 0) + a.amount;
        return acc;
      }, {});
  }

  // ── CSV export ─────────────────────────────────────────────────────────────
  const exportCsv = () => {
    const header = [
      "Month","Orders","Revenue (NPR)","Delivery Income (NPR)","Gross Income (NPR)",
      "Operating Expenses (NPR)","Marketing Expenses (NPR)","Social Work (NPR)",
      "Total Expenses (NPR)","Net Profit (NPR)","Cumulative Cash Flow (NPR)",
      "Profit Margin (%)",
    ];
    const dataRows = rows.map((r) => [
      r.label, r.orderCount, r.revenue, r.deliveryIncome, r.grossIncome,
      r.operatingExp, r.marketingExp, r.socialWork,
      r.totalExpenses, r.netProfit, r.cashFlow,
      r.grossIncome > 0 ? ((r.netProfit / r.grossIncome) * 100).toFixed(1) : "0",
    ]);
    const totalsRow = [
      "TOTAL", totals.orderCount, totals.revenue, totals.deliveryIncome, totals.grossIncome,
      totals.operatingExp, totals.marketingExp, totals.socialWork,
      totals.totalExpenses, totals.netProfit, rows[rows.length-1]?.cashFlow ?? 0,
      totals.grossIncome > 0 ? ((totals.netProfit / totals.grossIncome) * 100).toFixed(1) : "0",
    ];
    downloadCsv(
      `aavira-profit-loss-${selectedYear === "all" ? "all-time" : selectedYear}.csv`,
      [header, ...dataRows, totalsRow],
    );
    toast.success("Report downloaded");
  };

  // ── Detailed per-line-item CSV ─────────────────────────────────────────────
  const exportDetailed = () => {
    const rows2: (string | number)[][] = [
      ["Date","Type","Category / Platform","Description","Amount (NPR)"],
      ...orders.filter((o) => {
        if (selectedYear === "all") return true;
        return new Date(o.created_at).getFullYear() === selectedYear;
      }).map((o) => [
        o.created_at.slice(0,10), "Revenue", "Orders", `Order ${o.id.slice(0,8)}`, o.total,
      ]),
      ...expenses.filter((e) => {
        if (selectedYear === "all") return true;
        return new Date(e.expense_date).getFullYear() === selectedYear;
      }).map((e) => [
        e.expense_date, "Expense", e.category || "Uncategorised", e.description, -e.amount,
      ]),
      ...adSpends.filter((a) => {
        if (selectedYear === "all") return true;
        return new Date(a.spend_date).getFullYear() === selectedYear;
      }).map((a) => [
        a.spend_date, "Marketing", a.platform, a.campaign_name || "—", -a.amount,
      ]),
      ...impactEntries.filter((i) => selectedYear === "all" || i.year === selectedYear)
        .map((i) => [
          `${i.year}-${String(i.month).padStart(2,"0")}-01`,
          "Social Work", "Impact Fund", `${MONTH_NAMES[i.month-1]} ${i.year} contribution`,
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
  const maxGrossIncome = Math.max(...rows.map((r) => r.grossIncome), 1);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      <AdminPageHeader
        title="Profit & Loss"
        description="Monthly income, expenses, social work, and cash flow — one unified view."
      />

      {/* ── Controls ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Year filter */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground uppercase tracking-widest">Year</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setSelectedYear("all")}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                selectedYear === "all" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground hover:bg-muted",
              )}
            >
              All time
            </button>
            {availableYears.map((y) => (
              <button
                key={y}
                onClick={() => setSelectedYear(y)}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                  selectedYear === y ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground hover:bg-muted",
                )}
              >
                {y}
              </button>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
            Refresh
          </button>
          <button
            onClick={exportDetailed}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted border border-border transition-colors"
          >
            <Download className="size-3.5" />
            Detailed CSV
          </button>
          <button
            onClick={exportCsv}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-medium bg-foreground text-background hover:bg-foreground/90 transition-colors"
          >
            <Download className="size-3.5" />
            Summary CSV
          </button>
        </div>
      </div>

      {/* ── Summary cards ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          label="Gross income"
          value={fmt(totals.grossIncome)}
          sub={`${totals.orderCount} orders`}
        />
        <MetricCard
          label="Total expenses"
          value={fmt(totals.totalExpenses)}
          sub={pct(totals.totalExpenses, totals.grossIncome) + " of income"}
        />
        <MetricCard
          label="Social work"
          value={fmt(totals.socialWork)}
          sub="Impact fund contributions"
        />
        <MetricCard
          label="Net profit"
          value={fmt(totals.netProfit)}
          sub={`Margin ${pct(totals.netProfit, totals.grossIncome)}`}
          accent
          negative={totals.netProfit < 0}
        />
      </div>

      {/* ── Expense breakdown strip ────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card px-5 py-4">
        <p className="text-[11px] uppercase tracking-widest text-muted-foreground mb-3">Expense breakdown</p>
        <div className="flex flex-wrap gap-x-8 gap-y-2">
          {[
            { label: "Operating", value: totals.operatingExp, color: "bg-orange-400" },
            { label: "Marketing", value: totals.marketingExp, color: "bg-blue-400" },
            { label: "Social work", value: totals.socialWork, color: "bg-violet-400" },
          ].map(({ label, value, color }) => (
            <div key={label} className="flex items-center gap-2.5">
              <span className={cn("size-2 rounded-full shrink-0", color)} />
              <span className="text-xs text-muted-foreground">{label}</span>
              <span className="text-xs font-medium tabular-nums">{fmt(value, true)}</span>
              <span className="text-xs text-muted-foreground/50">({pct(value, totals.totalExpenses)})</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Monthly P&L table ──────────────────────────────────────────────── */}
      {rows.length === 0 ? (
        <div className="rounded-xl border border-border bg-card py-16 text-center">
          <BarChart3 className="size-8 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No data for this period.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border/60 flex items-center justify-between">
            <p className="text-sm font-medium">Monthly Statement</p>
            <p className="text-xs text-muted-foreground">
              {selectedYear === "all" ? "All time" : selectedYear} · {rows.length} month{rows.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-muted/40">
                  <TH>Month</TH>
                  <TH right>Orders</TH>
                  <TH right>Revenue</TH>
                  <TH right>Delivery</TH>
                  <TH right>Gross income</TH>
                  <TH right>Operating exp</TH>
                  <TH right>Marketing</TH>
                  <TH right>Social work</TH>
                  <TH right>Total exp</TH>
                  <TH right>Net profit</TH>
                  <TH right>Margin</TH>
                  <TH right>Cash flow</TH>
                  <TH>Trend</TH>
                  <th className="px-4 py-2.5 border-b border-border/60 w-8" />
                </tr>
              </thead>
              <tbody>
                {[...rows].reverse().map((r) => {
                  const isExpanded = expandedMonth === r.key;
                  const margin = r.grossIncome > 0 ? (r.netProfit / r.grossIncome) * 100 : 0;
                  const expCats = getMonthExpensesByCategory(r.year, r.month);
                  const adPlats = getMonthAdsByPlatform(r.year, r.month);
                  const impactEntry = impactEntries.find((i) => i.year === r.year && i.month === r.month);

                  return (
                    <>
                      <tr
                        key={r.key}
                        className={cn(
                          "border-b border-border/30 hover:bg-muted/20 transition-colors cursor-pointer",
                          isExpanded && "bg-muted/30",
                        )}
                        onClick={() => setExpandedMonth(isExpanded ? null : r.key)}
                      >
                        <TD bold>{r.label}</TD>
                        <TD right muted mono>{r.orderCount}</TD>
                        <TD right mono>{fmt(r.revenue)}</TD>
                        <TD right muted mono>{r.deliveryIncome > 0 ? fmt(r.deliveryIncome) : "—"}</TD>
                        <TD right bold mono>{fmt(r.grossIncome)}</TD>
                        <TD right muted mono>{r.operatingExp > 0 ? `-${fmt(r.operatingExp)}` : "—"}</TD>
                        <TD right muted mono>{r.marketingExp > 0 ? `-${fmt(r.marketingExp)}` : "—"}</TD>
                        <TD right muted mono>{r.socialWork > 0 ? `-${fmt(r.socialWork)}` : "—"}</TD>
                        <TD right neg mono>{r.totalExpenses > 0 ? `-${fmt(r.totalExpenses)}` : "—"}</TD>
                        <TD right mono accent={r.netProfit >= 0} neg={r.netProfit < 0} bold>
                          {fmt(r.netProfit)}
                        </TD>
                        <TD right muted>
                          <span className={cn(margin >= 0 ? "text-emerald-600" : "text-red-500")}>
                            {margin.toFixed(1)}%
                          </span>
                        </TD>
                        <TD right mono bold>
                          <span className={cn(r.cashFlow >= 0 ? "text-foreground" : "text-red-500")}>
                            {fmt(r.cashFlow)}
                          </span>
                        </TD>
                        <TD>
                          <Bar
                            value={r.netProfit}
                            max={maxNetProfit}
                            negative={r.netProfit < 0}
                          />
                        </TD>
                        <TD>
                          <ChevronDown
                            className={cn(
                              "size-4 text-muted-foreground transition-transform duration-200",
                              isExpanded && "rotate-180",
                            )}
                          />
                        </TD>
                      </tr>

                      {/* Expanded drill-down row */}
                      {isExpanded && (
                        <tr key={`${r.key}-detail`} className="bg-muted/10">
                          <td colSpan={14} className="px-6 py-5 border-b border-border/40">
                            <div className="grid md:grid-cols-3 gap-6">

                              {/* Income detail */}
                              <div>
                                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3 font-semibold">Income</p>
                                <div className="space-y-2">
                                  <div className="flex justify-between text-xs">
                                    <span className="text-muted-foreground">Product revenue</span>
                                    <span className="tabular-nums font-medium text-emerald-700">{fmt(r.revenue)}</span>
                                  </div>
                                  <div className="flex justify-between text-xs">
                                    <span className="text-muted-foreground">Delivery income</span>
                                    <span className="tabular-nums font-medium text-emerald-700">{fmt(r.deliveryIncome)}</span>
                                  </div>
                                  <div className="flex justify-between text-xs border-t border-border/40 pt-2 mt-1">
                                    <span className="font-semibold">Gross income</span>
                                    <span className="tabular-nums font-semibold">{fmt(r.grossIncome)}</span>
                                  </div>
                                  <div className="flex justify-between text-xs pt-1">
                                    <span className="text-muted-foreground">Orders placed</span>
                                    <span className="tabular-nums">{r.orderCount}</span>
                                  </div>
                                  {r.orderCount > 0 && (
                                    <div className="flex justify-between text-xs">
                                      <span className="text-muted-foreground">Avg. order value</span>
                                      <span className="tabular-nums">{fmt(r.grossIncome / r.orderCount)}</span>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Operating expenses breakdown */}
                              <div>
                                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3 font-semibold">Expenses</p>
                                <div className="space-y-2">
                                  {Object.entries(expCats).length > 0 ? (
                                    Object.entries(expCats).map(([cat, amt]) => (
                                      <div key={cat} className="flex justify-between text-xs">
                                        <span className="text-muted-foreground">{cat}</span>
                                        <span className="tabular-nums text-red-500">-{fmt(amt)}</span>
                                      </div>
                                    ))
                                  ) : (
                                    <p className="text-xs text-muted-foreground/60">No operating expenses</p>
                                  )}
                                  {Object.entries(adPlats).length > 0 && (
                                    <>
                                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground pt-2 font-medium">Marketing</p>
                                      {Object.entries(adPlats).map(([plat, amt]) => (
                                        <div key={plat} className="flex justify-between text-xs">
                                          <span className="text-muted-foreground">{plat}</span>
                                          <span className="tabular-nums text-red-500">-{fmt(amt)}</span>
                                        </div>
                                      ))}
                                    </>
                                  )}
                                  <div className="flex justify-between text-xs border-t border-border/40 pt-2 mt-1">
                                    <span className="font-semibold">Total expenses</span>
                                    <span className="tabular-nums font-semibold text-red-500">-{fmt(r.totalExpenses)}</span>
                                  </div>
                                </div>
                              </div>

                              {/* Social work + bottom line */}
                              <div>
                                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3 font-semibold">Social Work &amp; Bottom Line</p>
                                <div className="space-y-2">
                                  <div className="flex justify-between text-xs">
                                    <span className="text-muted-foreground">Impact contribution</span>
                                    <span className="tabular-nums text-violet-600">
                                      {r.socialWork > 0 ? `-${fmt(r.socialWork)}` : "—"}
                                    </span>
                                  </div>
                                  {impactEntry && (
                                    <div className="flex justify-between text-xs">
                                      <span className="text-muted-foreground">Status</span>
                                      <span className="capitalize text-muted-foreground">{impactEntry.status}</span>
                                    </div>
                                  )}
                                  <div className="flex justify-between text-xs border-t border-border/40 pt-2 mt-1">
                                    <span className="font-semibold">Net profit</span>
                                    <span className={cn(
                                      "tabular-nums font-semibold",
                                      r.netProfit >= 0 ? "text-emerald-700" : "text-red-500",
                                    )}>
                                      {fmt(r.netProfit)}
                                    </span>
                                  </div>
                                  <div className="flex justify-between text-xs">
                                    <span className="text-muted-foreground">Profit margin</span>
                                    <span className={cn("tabular-nums", margin >= 0 ? "text-emerald-600" : "text-red-500")}>
                                      {margin.toFixed(1)}%
                                    </span>
                                  </div>
                                  <div className="flex justify-between text-xs">
                                    <span className="text-muted-foreground">Cumulative cash flow</span>
                                    <span className={cn("tabular-nums font-medium", r.cashFlow >= 0 ? "text-foreground" : "text-red-500")}>
                                      {fmt(r.cashFlow)}
                                    </span>
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
                  <td className="px-4 py-3 text-xs font-bold uppercase tracking-widest">Total</td>
                  <td className="px-4 py-3 text-right text-xs font-semibold tabular-nums">{totals.orderCount}</td>
                  <td className="px-4 py-3 text-right text-xs font-semibold tabular-nums">{fmt(totals.revenue)}</td>
                  <td className="px-4 py-3 text-right text-xs tabular-nums text-muted-foreground">{fmt(totals.deliveryIncome)}</td>
                  <td className="px-4 py-3 text-right text-xs font-bold tabular-nums">{fmt(totals.grossIncome)}</td>
                  <td className="px-4 py-3 text-right text-xs tabular-nums text-muted-foreground">-{fmt(totals.operatingExp)}</td>
                  <td className="px-4 py-3 text-right text-xs tabular-nums text-muted-foreground">-{fmt(totals.marketingExp)}</td>
                  <td className="px-4 py-3 text-right text-xs tabular-nums text-muted-foreground">-{fmt(totals.socialWork)}</td>
                  <td className="px-4 py-3 text-right text-xs font-semibold tabular-nums text-red-500">-{fmt(totals.totalExpenses)}</td>
                  <td className={cn("px-4 py-3 text-right text-xs font-bold tabular-nums", totals.netProfit >= 0 ? "text-emerald-700" : "text-red-500")}>
                    {fmt(totals.netProfit)}
                  </td>
                  <td className={cn("px-4 py-3 text-right text-xs font-semibold", totals.netProfit >= 0 ? "text-emerald-600" : "text-red-500")}>
                    {pct(totals.netProfit, totals.grossIncome)}
                  </td>
                  <td className="px-4 py-3 text-right text-xs font-bold tabular-nums" colSpan={3}>
                    {fmt(rows[rows.length - 1]?.cashFlow ?? 0)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ── Cash flow visual ──────────────────────────────────────────────── */}
      {rows.length > 1 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-sm font-medium mb-1">Cumulative cash flow</p>
          <p className="text-xs text-muted-foreground mb-5">Running net profit over the selected period</p>
          <div className="flex items-end gap-1.5 h-28 w-full">
            {rows.map((r) => {
              const maxFlow = Math.max(...rows.map((x) => Math.abs(x.cashFlow)), 1);
              const heightPct = Math.min(100, (Math.abs(r.cashFlow) / maxFlow) * 100);
              const positive = r.cashFlow >= 0;
              return (
                <div
                  key={r.key}
                  className="flex-1 flex flex-col items-center gap-1 group min-w-0"
                  title={`${r.label}: ${fmt(r.cashFlow)}`}
                >
                  <div className="w-full flex items-end justify-center" style={{ height: "100px" }}>
                    <div
                      className={cn(
                        "w-full rounded-sm transition-all duration-300 group-hover:opacity-80",
                        positive ? "bg-emerald-500" : "bg-red-400",
                      )}
                      style={{ height: `${heightPct}%`, minHeight: "2px" }}
                    />
                  </div>
                  <span className="text-[9px] text-muted-foreground/60 truncate w-full text-center hidden sm:block">
                    {r.label.slice(0, 3)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
