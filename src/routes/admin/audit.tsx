/**
 * Fiscal Year Audit Report
 *
 * Nepali fiscal year: Shrawan 1 → Ashadh end (exact Gregorian dates per BS calendar).
 * Shrawan 1 exact dates sourced from NepaliPatro / GoN calendar:
 *   2079 BS → 2022-07-17   2080 BS → 2023-07-17
 *   2081 BS → 2024-07-16   2082 BS → 2025-07-17
 *   2083 BS → 2026-07-17   2084 BS → 2027-07-17
 *   2085 BS → 2028-07-16   2086 BS → 2029-07-17
 *
 * Data pulled:
 *   orders          → revenue, VAT, discounts, delivery, by source
 *   expenses        → operating costs
 *   ad_spend        → marketing costs
 *   products        → cost_price for COGS
 *   promo_codes     → usage summary
 *   impact_settings → social contribution %
 */

import { NepaliDate, toBS } from "@zener/nepali-datepicker-react";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminPageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Download, RefreshCw } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/audit")({
  component: AuditPage,
});

// ─── Types ────────────────────────────────────────────────────────────────────

interface Order {
  id: string;
  created_at: string;
  total: number;
  delivery_fee: number;
  discount_amount: number;
  vat_amount: number;
  status: string;
  pathao_status: string | null;
  product_id: string | null;
  product_name: string;
  unit_price: number;
  quantity: number;
  source: string;
  promo_code: string | null;
}

interface Expense {
  id: string;
  expense_date: string;
  amount: number;
  category: string;
  description: string | null;
}

interface AdSpend {
  id: string;
  spend_date: string;
  amount: number;
  platform: string;
}

interface Product {
  id: string;
  name: string;
  cost_price: number | null;
  stock_quantity: number | null;
  created_at: string;
}

interface PromoCode {
  code: string;
  discount_percent: number;
  used_count: number;
}


interface ProductSize {
  product_id: string;
  stock_quantity: number | null;
}

// ─── Nepali fiscal year helpers ───────────────────────────────────────────────

// Exact Gregorian date of Shrawan 1 for each BS year.
// Format: "YYYY-MM-DD" (local date, time treated as midnight).
const SHRAWAN_1: Record<number, string> = {
  2079: "2022-07-17",
  2080: "2023-07-17",
  2081: "2024-07-16",
  2082: "2025-07-17",
  2083: "2026-07-17",
  2084: "2027-07-17",
  2085: "2028-07-16",
  2086: "2029-07-17",
};

function shrawan1(bsYear: number): Date {
  const iso = SHRAWAN_1[bsYear];
  if (iso) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d, 0, 0, 0, 0);
  }
  // Fallback for years outside the table: approximate as BS - 57 + July 17
  return new Date(bsYear - 57, 6, 17, 0, 0, 0, 0);
}

function fiscalYearRange(bsYear: number): { start: Date; end: Date } {
  const start = shrawan1(bsYear);
  const nextStart = shrawan1(bsYear + 1);
  const end = new Date(nextStart.getTime() - 1); // 1 ms before next Shrawan 1
  return { start, end };
}

function getFiscalYear(date: Date): number {
  // AD year maps to BS year ≈ AD + 56 or AD + 57 depending on month.
  // BS new year (Baisakh 1) is mid-April; fiscal year starts Shrawan 1 (mid-July).
  // Estimate: dates Jan–Jun are still in the BS year that started last April (AD+56),
  // dates Jul–Dec are in the BS year that started this April (AD+57).
  const adYear = date.getFullYear();
  const approxBS = date.getMonth() >= 6 ? adYear + 57 : adYear + 56;
  for (const candidate of [approxBS - 1, approxBS, approxBS + 1]) {
    const { start, end } = fiscalYearRange(candidate);
    if (date >= start && date <= end) return candidate;
  }
  return approxBS;
}

function inFiscalYear(dateStr: string, bsYear: number): boolean {
  const d = new Date(dateStr);
  const { start, end } = fiscalYearRange(bsYear);
  return d >= start && d <= end;
}

// "आर्थिक वर्ष २०८२/८३" style — returns "2082/83"
function fiscalYearLabel(bsYear: number): string {
  return `${bsYear}/${String(bsYear + 1).slice(2)}`;
}

// Full audit report title e.g. "आर्थिक वर्ष २०८२/८३ को वार्षिक लेखापरीक्षण प्रतिवेदन"
// In English: "Annual Audit Report — Fiscal Year 2082/83 BS"
function auditTitle(bsYear: number): string {
  return `Annual Audit Report — FY ${fiscalYearLabel(bsYear)} BS`;
}

function currentFiscalYear(): number {
  return getFiscalYear(new Date());
}

// ─── Formatting ───────────────────────────────────────────────────────────────

function fmt(n: number) {
  return `NRS ${Math.round(n).toLocaleString("en-NP")}`;
}

function pct(n: number, total: number) {
  if (!total) return "0%";
  return `${((n / total) * 100).toFixed(1)}%`;
}

function isCancelled(o: Order) {
  return o.status === "cancelled" || (!!o.pathao_status && /cancel|return/i.test(o.pathao_status));
}

// ─── Section components ───────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8 print:mb-6">
      <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3 print:text-black">{title}</h3>
      {children}
    </div>
  );
}

function Row({ label, value, bold, indent, highlight }: { label: string; value: string; bold?: boolean; indent?: boolean; highlight?: boolean }) {
  return (
    <div className={`flex justify-between py-1.5 border-b border-dashed border-border last:border-0 ${indent ? "pl-4" : ""} ${highlight ? "bg-muted/40 px-2 rounded" : ""}`}>
      <span className={`text-sm ${bold ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{label}</span>
      <span className={`text-sm tabular-nums ${bold ? "font-bold text-foreground" : "text-muted-foreground"}`}>{value}</span>
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

function AuditPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [adSpends, setAdSpends] = useState<AdSpend[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
  const [productSizes, setProductSizes] = useState<ProductSize[]>([]);
  const [impactPct, setImpactPct] = useState(5);
  const [loading, setLoading] = useState(true);
  const [selectedFY, setSelectedFY] = useState<number>(currentFiscalYear());
  const printRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    const db = supabase as any;
    const [o, e, a, p, pr, s, ps] = await Promise.all([
      db.from("orders").select("id,created_at,total,delivery_fee,discount_amount,vat_amount,status,pathao_status,product_id,product_name,unit_price,quantity,source,promo_code"),
      db.from("expenses").select("*"),
      db.from("ad_spend").select("*"),
      db.from("products").select("id,name,cost_price,stock_quantity,created_at"),
      db.from("promo_codes").select("code,discount_percent,used_count"),
      db.from("impact_settings").select("contribution_percentage").limit(1).single(),
      db.from("product_sizes").select("product_id,stock_quantity"),
    ]);
    if (o.data) setOrders(o.data);
    if (e.data) setExpenses(e.data);
    if (a.data) setAdSpends(a.data);
    if (p.data) setProducts(p.data);
    if (pr.data) setPromoCodes(pr.data);
    if (s.data?.contribution_percentage != null) setImpactPct(Number(s.data.contribution_percentage));
    if (ps.data) setProductSizes(ps.data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Derive available fiscal years from data
  const availableFYs = useMemo(() => {
    const fys = new Set<number>();
    orders.forEach((o) => fys.add(getFiscalYear(new Date(o.created_at))));
    expenses.forEach((e) => fys.add(getFiscalYear(new Date(e.expense_date))));
    adSpends.forEach((a) => fys.add(getFiscalYear(new Date(a.spend_date))));
    const sorted = Array.from(fys).sort((a, b) => b - a);
    return sorted;
  }, [orders, expenses, adSpends]);

  // If current FY has no data yet, fall back to most recent FY that does
  useEffect(() => {
    if (availableFYs.length > 0 && !availableFYs.includes(selectedFY)) {
      setSelectedFY(availableFYs[0]);
    }
  }, [availableFYs]);

  const productCostMap = useMemo(() => {
    const m: Record<string, number> = {};
    products.forEach((p) => { if (p.cost_price != null) m[p.id] = p.cost_price; });
    return m;
  }, [products]);

  // ── Filter to selected FY ──────────────────────────────────────────────────
  const fyOrders = useMemo(() => orders.filter((o) => inFiscalYear(o.created_at, selectedFY)), [orders, selectedFY]);
  const fyExpenses = useMemo(() => expenses.filter((e) => inFiscalYear(e.expense_date, selectedFY)), [expenses, selectedFY]);
  const fyAdSpends = useMemo(() => adSpends.filter((a) => inFiscalYear(a.spend_date, selectedFY)), [adSpends, selectedFY]);

  const activeOrders = useMemo(() => fyOrders.filter((o) => !isCancelled(o)), [fyOrders]);
  const cancelledOrders = useMemo(() => fyOrders.filter(isCancelled), [fyOrders]);

  // ── Revenue ───────────────────────────────────────────────────────────────
  const grossRevenue = useMemo(() => activeOrders.reduce((s, o) => s + Number(o.total), 0), [activeOrders]);
  const totalVat = useMemo(() => activeOrders.reduce((s, o) => s + Number(o.vat_amount ?? 0), 0), [activeOrders]);
  const totalDelivery = useMemo(() => activeOrders.reduce((s, o) => s + Number(o.delivery_fee ?? 0), 0), [activeOrders]);
  const totalDiscounts = useMemo(() => activeOrders.reduce((s, o) => s + Number(o.discount_amount ?? 0), 0), [activeOrders]);
  // Net product revenue = gross - delivery - VAT (VAT is collected on behalf of govt)
  const netProductRevenue = grossRevenue - totalDelivery - totalVat;

  // ── COGS ──────────────────────────────────────────────────────────────────
  const stockByProduct = useMemo(() => {
    const m: Record<string, number> = {};
    productSizes.forEach((ps) => {
      m[ps.product_id] = (m[ps.product_id] ?? 0) + (ps.stock_quantity ?? 0);
    });
    return m;
  }, [productSizes]);

  const getStock = (p: Product) => {
    const sizeQty = stockByProduct[p.id];
    return sizeQty !== undefined ? sizeQty : (p.stock_quantity ?? 0);
  };

  const closingStock = useMemo(() => products.reduce((s, p) => {
    return s + getStock(p) * (p.cost_price ?? 0);
  }, 0), [products, stockByProduct]);

  // Units sold during FY per product
  const unitsSoldInFY = useMemo(() => {
    const m: Record<string, number> = {};
    activeOrders.forEach((o) => {
      if (o.product_id) m[o.product_id] = (m[o.product_id] ?? 0) + Number(o.quantity);
    });
    return m;
  }, [activeOrders]);

  // Opening stock = closing stock + units sold during FY (reverse from current)
  const openingStock = useMemo(() => products.reduce((s, p) => {
    const soldQty = unitsSoldInFY[p.id] ?? 0;
    const currentQty = getStock(p);
    const cost = p.cost_price ?? 0;
    return s + (currentQty + soldQty) * cost;
  }, 0), [products, unitsSoldInFY, stockByProduct]);

  // COGS = Opening Stock − Closing Stock
  const cogs = openingStock - closingStock;

  const grossProfit = netProductRevenue - cogs;

  // ── Expenses ──────────────────────────────────────────────────────────────
  const opExpenses = useMemo(() => fyExpenses.reduce((s, e) => s + Number(e.amount), 0), [fyExpenses]);
  const adExpenses = useMemo(() => fyAdSpends.reduce((s, a) => s + Number(a.amount), 0), [fyAdSpends]);
  const socialContrib = Math.round((grossProfit - opExpenses - adExpenses) * (impactPct / 100) * 100) / 100;
  const totalExpenses = cogs + opExpenses + adExpenses + Math.max(0, socialContrib);
  const netProfit = grossRevenue - totalDelivery - totalVat - totalExpenses;

  // ── Expense breakdown by category ─────────────────────────────────────────
  const expenseByCategory = useMemo(() => {
    const m: Record<string, number> = {};
    fyExpenses.forEach((e) => { m[e.category] = (m[e.category] ?? 0) + Number(e.amount); });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [fyExpenses]);

  // ── Orders by source ──────────────────────────────────────────────────────
  const ordersBySource = useMemo(() => {
    const m: Record<string, { count: number; revenue: number }> = {};
    activeOrders.forEach((o) => {
      const src = o.source ?? "website";
      if (!m[src]) m[src] = { count: 0, revenue: 0 };
      m[src].count++;
      m[src].revenue += Number(o.total);
    });
    return Object.entries(m).sort((a, b) => b[1].revenue - a[1].revenue);
  }, [activeOrders]);

  // ── Top products ──────────────────────────────────────────────────────────
  const topProducts = useMemo(() => {
    const m: Record<string, { name: string; units: number; revenue: number }> = {};
    activeOrders.forEach((o) => {
      const key = o.product_id ?? o.product_name;
      if (!m[key]) m[key] = { name: o.product_name, units: 0, revenue: 0 };
      m[key].units += Number(o.quantity);
      m[key].revenue += Number(o.total) - Number(o.delivery_fee ?? 0) - Number(o.vat_amount ?? 0);
    });
    return Object.values(m).sort((a, b) => b.revenue - a.revenue).slice(0, 10);
  }, [activeOrders]);

  // ── Promo usage ───────────────────────────────────────────────────────────
  const promoUsageInFY = useMemo(() => {
    const m: Record<string, number> = {};
    activeOrders.forEach((o) => { if (o.promo_code) m[o.promo_code] = (m[o.promo_code] ?? 0) + 1; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [activeOrders]);

  // ── PDF export ────────────────────────────────────────────────────────────
  const buildPrintHTML = (autoprint: boolean): string => {
    const fy = fiscalYearLabel(selectedFY);
    const filename = `Aavira-Audit-FY${fy.replace("/", "-")}-BS`;

    const row = (label: string, value: string, opts: { bold?: boolean; indent?: boolean; highlight?: boolean } = {}) =>
      `<tr class="${[opts.bold ? "bold" : "", opts.indent ? "indent" : "", opts.highlight ? "highlight" : ""].filter(Boolean).join(" ")}">
        <td>${label}</td><td class="val">${value}</td>
      </tr>`;

    const section = (title: string, rows: string) =>
      `<div class="section"><div class="section-title">${title}</div><table>${rows}</table></div>`;

    const vatSection = totalVat > 0 ? section("7. VAT Statement", [
      row("Total VAT collected from customers", fmt(totalVat), { bold: true }),
    ].join("") + `<tr><td colspan="2" class="note">VAT applied to product subtotal only. Delivery fees are VAT-exempt.</td></tr>`) : "";

    const dateStr = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

    // Convert AD date → BS date string using the Nepali Date API
    const adToBS = (d: Date): string => {
      const adStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const bs = toBS(adStr);
      // toBS month is 0-based; construct NepaliDate with BS string (month+1)
      const ndStr = `${bs.year}-${String(bs.month + 1).padStart(2, "0")}-${String(bs.date).padStart(2, "0")}`;
      return new NepaliDate(ndStr).format("MMMM D, YYYY", "np");
    };

    const todayBS  = adToBS(new Date());
    const bsStart  = adToBS(start);
    const bsEnd    = adToBS(end);
    const logoUrl = `${window.location.origin}/Aavira-logo.png`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>${filename}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Times New Roman', Times, serif; font-size: 11pt; color: #000; background: #fff; }

    /* ── Page layout ── */
    .page { padding: 18mm 20mm 16mm; position: relative; }
    .cover-page { height: 297mm; overflow: hidden; page-break-after: always; }
    .page-break { page-break-before: always; }

    /* ── Cover ── */
    .cover { text-align: center; padding: 40mm 0 0; }
    .cover .jurisdiction { font-size: 9pt; letter-spacing: 0.2em; text-transform: uppercase; color: #555; margin-bottom: 6px; }
    .cover .entity-name { font-size: 28pt; font-weight: bold; letter-spacing: 0.04em; text-transform: uppercase; margin-bottom: 2px; }
    .cover .entity-type { font-size: 10pt; color: #444; margin-bottom: 32px; }
    .cover .doc-title-box { border-top: 2px solid #000; border-bottom: 2px solid #000; padding: 10px 0; margin-bottom: 28px; }
    .cover .doc-title { font-size: 14pt; font-weight: bold; text-transform: uppercase; letter-spacing: 0.08em; }
    .cover .doc-subtitle { font-size: 10pt; color: #444; margin-top: 4px; }
    .cover .fy-label { font-size: 16pt; font-weight: bold; margin-bottom: 6px; }
    .cover .period { font-size: 10pt; color: #333; margin-bottom: 40px; }
    .cover .meta { width: 260px; margin: 0 auto; text-align: left; border: 1px solid #999; }
    .cover .meta tr td { padding: 5px 10px; font-size: 9.5pt; border-bottom: 1px solid #ddd; }
    .cover .meta tr:last-child td { border-bottom: none; }
    .cover .meta td:first-child { font-weight: bold; color: #444; width: 110px; background: #f5f5f5; }
    .cover img { max-width: 220px; height: auto; display: block; margin: 0 auto 18px; object-fit: contain; object-position: center top; }
    .cover .confidential { margin-top: 48px; font-size: 9pt; letter-spacing: 0.15em; text-transform: uppercase; color: #888; border: 1px solid #ccc; display: inline-block; padding: 4px 14px; }

    /* ── Report header (non-cover pages) ── */
    .report-header { border-bottom: 2px solid #000; padding-bottom: 6px; margin-bottom: 18px; display: flex; justify-content: space-between; align-items: flex-end; }
    .report-header .rh-left .rh-entity { font-size: 13pt; font-weight: bold; text-transform: uppercase; letter-spacing: 0.04em; }
    .report-header .rh-left .rh-title { font-size: 9pt; color: #555; }
    .report-header .rh-right { text-align: right; font-size: 9pt; color: #555; line-height: 1.6; }

    /* ── Section ── */
    .section { margin-bottom: 18px; page-break-inside: avoid; }
    .section-head { background: #000; color: #fff; padding: 4px 8px; font-size: 9pt; font-weight: bold; text-transform: uppercase; letter-spacing: 0.07em; }
    table.data { width: 100%; border-collapse: collapse; border: 1px solid #aaa; border-top: none; }
    table.data tr td { padding: 4px 8px; font-size: 10pt; border-bottom: 1px solid #ddd; vertical-align: top; }
    table.data tr:last-child td { border-bottom: none; }
    table.data td.val { text-align: right; white-space: nowrap; min-width: 130px; font-variant-numeric: tabular-nums; }
    table.data tr.bold td { font-weight: bold; }
    table.data tr.indent td:first-child { padding-left: 22px; font-style: italic; color: #333; }
    table.data tr.highlight { background: #efefef; }
    table.data tr.highlight td { font-weight: bold; border-top: 1px solid #999; border-bottom: 1px solid #999; }
    table.data td[colspan] { font-weight: bold; }
    table.data tr.spacer td { padding: 2px; border: none; background: transparent; }
    td.note { font-size: 9pt; color: #666; font-style: italic; background: #fafafa; }

    /* ── Signature ── */
    .sig-section { margin-top: 32px; }
    .sig-title { font-size: 9pt; font-weight: bold; text-transform: uppercase; letter-spacing: 0.06em; border-bottom: 1px solid #000; padding-bottom: 3px; margin-bottom: 20px; }
    .sig-grid { display: flex; gap: 40px; }
    .sig-box { flex: 1; }
    .sig-line { border-bottom: 1px solid #000; margin-bottom: 5px; height: 28px; }
    .sig-name { font-size: 9.5pt; font-weight: bold; }
    .sig-role { font-size: 8.5pt; color: #555; }
    .sig-date { font-size: 8.5pt; color: #555; margin-top: 2px; }

    /* ── Footer ── */
    .page-footer { margin-top: 24px; border-top: 1px solid #999; padding-top: 6px; display: flex; justify-content: space-between; font-size: 8pt; color: #777; }

    @page { size: A4; margin: 0; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style>
</head>
<body>

<!-- ═══════════════════════ COVER PAGE ═══════════════════════ -->
<div class="page cover-page" style="display:flex;flex-direction:column;align-items:center;">
  <div class="cover">
    <img src="${logoUrl}" alt="Aavira" onerror="this.style.display='none';document.getElementById('logo-fallback').style.display='block'"/>
    <div id="logo-fallback" style="display:none;font-size:26pt;font-weight:bold;letter-spacing:0.12em;text-transform:uppercase;margin-bottom:10px;">AAVIRA</div>
    <div class="jurisdiction">Nepal &mdash; Private Business Entity</div>
    <div class="entity-type">Retail &amp; E-Commerce</div>

    <div class="doc-title-box">
      <div class="doc-title">Annual Internal Financial Audit Report</div>
      <div class="doc-subtitle">Statement of Accounts &amp; Financial Review</div>
    </div>

    <div class="fy-label">Fiscal Year ${fy} BS</div>
    <div class="period">${dateStr(start)} &mdash; ${dateStr(end)}</div>
    <div class="period-np" style="font-size:10pt;color:#555;margin-top:2px;">(${bsStart} &mdash; ${bsEnd})</div>

    <table class="meta">
      <tr><td>Report No.</td><td>AUD-${fy.replace("/", "")}-001</td></tr>
      <tr><td>Prepared by</td><td>The Aavira Management System</td></tr>
      <tr><td>Date Issued</td><td>${dateStr(new Date())} (${todayBS})</td></tr>
      <tr><td>Currency</td><td>Nepalese Rupee (NRS)</td></tr>
      <tr><td>Fiscal Standard</td><td>Nepali Calendar (BS)</td></tr>
    </table>

    <div class="confidential">Confidential &mdash; Internal Use Only</div>
  </div>
</div>

<!-- ═══════════════════════ REPORT PAGES ═══════════════════════ -->
<div class="page">

  <div class="report-header">
    <div class="rh-left">
      <div class="rh-entity">The Aavira</div>
      <div class="rh-title">Annual Financial Audit &mdash; FY ${fy} BS</div>
    </div>
    <div class="rh-right">
      Report No.: AUD-${fy.replace("/", "")}-001<br/>
      Issued: ${dateStr(new Date())} (${todayBS})<br/>
      Period: ${dateStr(start)} &mdash; ${dateStr(end)}<br/>
      (${bsStart} &mdash; ${bsEnd})
    </div>
  </div>

  <!-- 1. Income Statement -->
  <div class="section">
    <div class="section-head">1. Income Statement</div>
    <table class="data">
      <tr class="bold"><td>Gross Revenue</td><td class="val">${fmt(grossRevenue)}</td></tr>
      <tr class="indent"><td>Less: Delivery fees</td><td class="val">(${fmt(totalDelivery)})</td></tr>
      <tr class="indent"><td>Less: Discounts allowed</td><td class="val">(${fmt(totalDiscounts)})</td></tr>
      <tr class="spacer"><td colspan="2"></td></tr>
      <tr class="highlight"><td>Net Revenue</td><td class="val">${fmt(netProductRevenue)}</td></tr>
    </table>
  </div>

  <!-- 2. Cost of Goods Sold -->
  <div class="section">
    <div class="section-head">2. Cost of Goods Sold</div>
    <table class="data">
      <tr><td>Opening Stock (at cost)</td><td class="val">${fmt(openingStock)}</td></tr>
      <tr class="indent"><td>Less: Closing Stock (at cost) <span style="font-size:8pt;color:#888;font-style:italic;">(refer Schedule 2a)</span></td><td class="val">(${fmt(closingStock)})</td></tr>
      <tr class="spacer"><td colspan="2"></td></tr>
      <tr class="bold"><td>Cost of Goods Sold</td><td class="val">${fmt(cogs)}</td></tr>
      <tr class="spacer"><td colspan="2"></td></tr>
      <tr class="highlight"><td>Gross Profit</td><td class="val">${fmt(grossProfit)}</td></tr>
    </table>
  </div>

  <!-- 3. Operating Expenditure -->
  <div class="section">
    <div class="section-head">3. Operating Expenditure</div>
    <table class="data">
      ${expenseByCategory.length === 0
        ? `<tr><td colspan="2" class="note">Nil — no operating expenses recorded for this period.</td></tr>`
        : expenseByCategory.map(([cat, amt]) => `<tr><td>${cat}</td><td class="val">${fmt(amt)}</td></tr>`).join("")
      }
      <tr class="indent"><td>Marketing &amp; advertising</td><td class="val">${fmt(adExpenses)}</td></tr>
      <tr class="spacer"><td colspan="2"></td></tr>
      <tr class="highlight"><td>Total Expenditure</td><td class="val">${fmt(opExpenses + adExpenses)}</td></tr>
    </table>
  </div>

  <!-- 4. Profit & Loss -->
  <div class="section">
    <div class="section-head">4. Profit &amp; Loss Account</div>
    <table class="data">
      <tr><td>Gross Profit</td><td class="val">${fmt(grossProfit)}</td></tr>
      <tr class="indent"><td>Less: Total Operating Expenditure</td><td class="val">(${fmt(opExpenses + adExpenses)})</td></tr>
      <tr class="spacer"><td colspan="2"></td></tr>
      <tr class="highlight"><td>Net Profit / (Net Loss)</td><td class="val">${fmt(netProfit)}</td></tr>
    </table>
  </div>

  ${totalVat > 0 ? `
  <!-- 5. VAT Account -->
  <div class="section">
    <div class="section-head">5. Value Added Tax (VAT) Account</div>
    <table class="data">
      <tr><td>VAT collected from customers during the period</td><td class="val">${fmt(totalVat)}</td></tr>
      <tr><td colspan="2" class="note">VAT is levied on product value only. Delivery charges are exempt. Full amount is payable to the Inland Revenue Department, Government of Nepal.</td></tr>
    </table>
  </div>` : ""}

  <!-- Signature Block -->
  <div class="sig-section">
    <div class="sig-title">Declaration &amp; Authorisation</div>
    <p style="font-size:9.5pt;margin-bottom:18px;color:#333;">
      We, the undersigned, confirm that the financial statements and figures contained in this report are, to the best of our knowledge, accurate and complete for the fiscal year ending ${dateStr(end)} (${bsEnd}).
    </p>
    <div class="sig-grid">
      <div class="sig-box">
        <div class="sig-line"></div>
        <div class="sig-name">Authorised Signatory</div>
        <div class="sig-role">Business Owner / Director, The Aavira</div>
        <div class="sig-date">Date: ___________________</div>
      </div>
      <div class="sig-box">
        <div class="sig-line"></div>
        <div class="sig-name">Accountant / Auditor</div>
        <div class="sig-role">Name: ___________________</div>
        <div class="sig-date">Date: ___________________</div>
      </div>
    </div>
  </div>

  <div class="page-footer">
    <div>The Aavira &mdash; Annual Audit Report FY ${fy} BS &mdash; CONFIDENTIAL</div>
    <div>All figures in NRS &bull; Nepali Fiscal Year (Shrawan 1 &ndash; Ashadh end)</div>
  </div>

  <!-- Schedule 2a — new page, like a real balance sheet annexure -->
  <div class="page-break"></div>
  <div class="report-header" style="margin-bottom:18px;">
    <div class="rh-left">
      <div class="rh-entity">THE AAVIRA</div>
      <div class="rh-title">Schedule 2a &mdash; Inventory Schedule (Closing Stock Detail)</div>
    </div>
    <div class="rh-right">
      FY ${fy} BS<br/>${bsStart} &mdash; ${bsEnd}
    </div>
  </div>
  <div class="section">
    <table class="data">
      <tr style="background:#f0f0f0;">
        <td style="font-weight:bold;font-size:9pt;">Product</td>
        <td style="font-weight:bold;font-size:9pt;">Date Added</td>
        <td class="val" style="font-weight:bold;font-size:9pt;">Cost/Unit</td>
        <td class="val" style="font-weight:bold;font-size:9pt;">Stock (units)</td>
        <td class="val" style="font-weight:bold;font-size:9pt;">Stock Value</td>
      </tr>
      ${products.map((p) => {
        const sizeQty = stockByProduct[p.id];
        const qty = sizeQty !== undefined ? sizeQty : p.stock_quantity;
        const cost = p.cost_price ?? 0;
        const tracked = qty !== null && qty !== undefined;
        const val = (qty ?? 0) * cost;
        const addedBS = adToBS(new Date("2026-01-17"));
        return `<tr>
          <td style="font-size:9.5pt;">${p.name}</td>
          <td style="font-size:9pt;color:#555;">${addedBS}</td>
          <td class="val" style="font-size:9.5pt;">${cost > 0 ? fmt(cost) : "—"}</td>
          <td class="val" style="font-size:9.5pt;">${tracked ? qty : "—"}</td>
          <td class="val" style="font-size:9.5pt;">${tracked && cost > 0 ? fmt(val) : "—"}</td>
        </tr>`;
      }).join("")}
      <tr class="highlight">
        <td colspan="4">Total Closing Stock Value</td>
        <td class="val">${fmt(closingStock)}</td>
      </tr>
    </table>
  </div>
  <div class="page-footer">
    <div>The Aavira &mdash; Schedule 2a: Inventory &mdash; FY ${fy} BS &mdash; CONFIDENTIAL</div>
    <div>Refer to main report for full context</div>
  </div>
</div>

${autoprint ? `<script>window.addEventListener('load', function(){ setTimeout(function(){ window.print(); }, 500); });<\/script>` : ""}
</body>
</html>`;
  };

  const openPrintWindow = (autoprint: boolean) => {
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) { toast.error("Pop-up blocked — allow pop-ups for this site."); return; }
    win.document.write(buildPrintHTML(autoprint));
    win.document.close();
  };

  const handlePrint = () => openPrintWindow(false);
  const handlePDF = () => openPrintWindow(true);

  const buildPLHTML = (): string => {
    const fy = fiscalYearLabel(selectedFY);
    const { start, end } = fiscalYearRange(selectedFY);
    const adToBS = (d: Date): string => {
      const adStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const bs = toBS(adStr);
      const ndStr = `${bs.year}-${String(bs.month + 1).padStart(2, "0")}-${String(bs.date).padStart(2, "0")}`;
      return new NepaliDate(ndStr).format("MMMM D, YYYY", "np");
    };
    const bsStart = adToBS(start);
    const bsEnd   = adToBS(end);
    const adStart = start.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
    const adEnd   = end.toLocaleDateString("en-GB",   { day: "2-digit", month: "long", year: "numeric" });

    const rnd = (v: number) => Math.round(v);
    const money = (v: number) => rnd(v).toLocaleString("en-IN");
    const neg   = (v: number) => v === 0 ? "—" : `(${money(Math.abs(v))})`;
    const pct   = (num: number, den: number) => den === 0 ? "—" : `${((num / den) * 100).toFixed(1)}%`;

    // Classify expenses
    const sellingCats = ["marketing", "packaging", "shipping"];
    let sellingExp = adExpenses;
    let gaExp = 0;
    const sellingLines: [string, number][] = [["Marketing & Advertising", adExpenses]];
    const gaLines: [string, number][] = [];
    expenseByCategory.forEach(([cat, amt]) => {
      if (sellingCats.some((s) => cat.toLowerCase().includes(s))) {
        sellingExp += amt;
        sellingLines.push([cat, amt]);
      } else {
        gaExp += amt;
        gaLines.push([cat, amt]);
      }
    });
    const totalOpEx    = sellingExp + gaExp;
    const ebit         = grossProfit - totalOpEx;
    const ebitda       = ebit; // no D&A
    const ebt          = ebit; // no interest
    const taxProvision = Math.max(0, rnd(ebt * 0.25));
    const pat          = ebt - taxProvision;
    const sc           = Math.max(0, rnd(socialContrib));
    const retained     = pat - sc;

    // Row builders — 4-column CA style: particulars | note | sub-amount | total
    const td = (txt: string, opts: { right?: boolean; bold?: boolean; italic?: boolean; pad?: string; border?: string; bg?: string; size?: string; color?: string } = {}) =>
      `<td style="padding:${opts.pad ?? "4px 6px"};${opts.right ? "text-align:right;" : ""}${opts.bold ? "font-weight:bold;" : ""}${opts.italic ? "font-style:italic;" : ""}${opts.border ? `border-${opts.border}:1px solid #aaa;` : ""}${opts.bg ? `background:${opts.bg};` : ""}${opts.color ? `color:${opts.color};` : ""}font-size:${opts.size ?? "9.5pt"};">${txt}</td>`;

    // particulars | note# | sub | total
    const row = (part: string, noteN: string, sub: string, total: string, opts: { bold?: boolean; italic?: boolean; bg?: string; topBorder?: boolean; doubleUnder?: boolean } = {}) =>
      `<tr style="${opts.bg ? `background:${opts.bg};` : ""}${opts.topBorder ? "border-top:1px solid #999;" : ""}">
        ${td(part, { bold: opts.bold, italic: opts.italic, pad: "4px 6px 4px 8px" })}
        ${td(noteN, { italic: true, color: "#888", size: "8pt", right: true })}
        ${td(sub,   { right: true, bold: opts.bold, border: sub && sub !== "&nbsp;" ? undefined : undefined })}
        ${td(total, { right: true, bold: opts.bold, border: opts.doubleUnder ? "bottom" : undefined, bg: opts.bg })}
      </tr>`;

    const blank = () => `<tr><td colspan="4" style="padding:2px 0;"></td></tr>`;
    const rule  = (thick = false) => `<tr><td colspan="4" style="padding:0;border-top:${thick ? "1.5px solid #000" : "1px solid #ccc"};"></td></tr>`;
    const head  = (label: string) => `<tr style="background:#111;">
      <td colspan="4" style="padding:5px 8px;font-size:8pt;font-weight:bold;letter-spacing:0.1em;text-transform:uppercase;color:#fff;">${label}</td>
    </tr>`;
    const colrow = (part: string, noteN: string, sub: string, total: string, bold = false, bg = "") =>
      row(part, noteN, sub, total, { bold, bg });

    return `<!DOCTYPE html><html lang="en"><head>
<meta charset="utf-8"/>
<title>The Aavira — Statement of Profit &amp; Loss FY ${fy} BS</title>
<style>
  @page { size: A4 portrait; margin: 16mm 18mm 14mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Times New Roman', Times, serif; font-size: 9.5pt; color: #111; background: #fff; line-height: 1.45; }
  table { width: 100%; border-collapse: collapse; }
  col.part  { width: 54%; }
  col.note  { width: 8%; }
  col.sub   { width: 19%; }
  col.total { width: 19%; }
  .kpi-table td { padding: 8px 12px; border: 1px solid #ddd; text-align: center; }
  .kpi-label { font-size: 7pt; text-transform: uppercase; letter-spacing: 0.08em; color: #777; }
  .kpi-value { font-size: 12pt; font-weight: bold; margin-top: 2px; }
  .kpi-sub   { font-size: 7.5pt; color: #888; margin-top: 1px; }
  .notes-table td { padding: 3px 6px; font-size: 8pt; color: #444; vertical-align: top; border-bottom: 1px solid #f0f0f0; }
  .sig-table td { padding: 0 20px 0 0; vertical-align: bottom; width: 50%; }
  .sig-line { border-bottom: 1px solid #000; height: 28px; margin-bottom: 3px; }
  .footer { margin-top: 16px; border-top: 1px solid #ccc; padding-top: 5px; display: table; width: 100%; font-size: 7pt; color: #999; }
  .footer-l { display: table-cell; }
  .footer-r { display: table-cell; text-align: right; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head><body>

<!-- ── LETTERHEAD ─────────────────────────────────────── -->
<table style="margin-bottom:8px;">
  <tr>
    <td style="vertical-align:top;width:60%;">
      <div style="font-size:18pt;font-weight:bold;letter-spacing:0.08em;text-transform:uppercase;line-height:1;">THE AAVIRA</div>
      <div style="font-size:8pt;color:#666;margin-top:3px;letter-spacing:0.04em;">Fashion Retail &nbsp;&bull;&nbsp; Sole Proprietorship &nbsp;&bull;&nbsp; Nepal</div>
    </td>
    <td style="text-align:right;vertical-align:top;font-size:8.5pt;color:#555;line-height:1.7;">
      <div style="font-size:11pt;font-weight:bold;color:#000;margin-bottom:2px;">Statement of Profit &amp; Loss</div>
      <div>For the year ended ${bsEnd}</div>
      <div style="color:#888;">(${adEnd})</div>
      <div>FY ${fy} BS</div>
    </td>
  </tr>
</table>
<div style="border-top:3px solid #000;margin-bottom:1px;"></div>
<div style="border-top:1px solid #000;margin-bottom:12px;"></div>

<!-- ── KPI SUMMARY ────────────────────────────────────── -->
<table class="kpi-table" style="margin-bottom:14px;">
  <tr>
    <td><div class="kpi-label">Net Revenue</div><div class="kpi-value">NRS ${money(netProductRevenue)}</div><div class="kpi-sub">&nbsp;</div></td>
    <td><div class="kpi-label">Gross Profit</div><div class="kpi-value">NRS ${money(grossProfit)}</div><div class="kpi-sub">Margin: ${pct(grossProfit, netProductRevenue)}</div></td>
    <td><div class="kpi-label">EBITDA</div><div class="kpi-value">NRS ${money(ebitda)}</div><div class="kpi-sub">Margin: ${pct(ebitda, netProductRevenue)}</div></td>
    <td><div class="kpi-label">EBIT</div><div class="kpi-value">NRS ${money(ebit)}</div><div class="kpi-sub">Margin: ${pct(ebit, netProductRevenue)}</div></td>
    <td><div class="kpi-label">Net Profit (PAT)</div><div class="kpi-value">NRS ${money(pat)}</div><div class="kpi-sub">Margin: ${pct(pat, netProductRevenue)}</div></td>
  </tr>
</table>

<!-- ── COLUMN HEADERS ─────────────────────────────────── -->
<table>
  <colgroup><col class="part"/><col class="note"/><col class="sub"/><col class="total"/></colgroup>
  <tr style="border-bottom:1.5px solid #000;border-top:1px solid #000;">
    ${td("Particulars", { bold: true, pad: "4px 6px 4px 8px", size: "8.5pt" })}
    ${td("Note", { bold: true, right: true, size: "8.5pt" })}
    ${td("NRS", { bold: true, right: true, size: "8.5pt" })}
    ${td("NRS", { bold: true, right: true, size: "8.5pt" })}
  </tr>

  <!-- I. REVENUE -->
  ${blank()}
  ${head("I.  Revenue from Operations")}
  ${colrow("Gross Revenue from Operations", "1", money(grossRevenue), "")}
  ${colrow("Less: Delivery charges (pass-through)", "", neg(totalDelivery), "", false)}
  ${colrow("Less: Discounts &amp; promotional allowances", "", neg(totalDiscounts), "", false)}
  ${totalVat > 0 ? colrow("Less: Output VAT collected (payable to IRD)", "2", neg(totalVat), "", false) : ""}
  ${rule(true)}
  ${colrow("Net Revenue from Operations", "", "", money(netProductRevenue), true, "#f2f2f2")}

  <!-- II. COGS -->
  ${blank()}
  ${head("II.  Cost of Goods Sold")}
  ${colrow("Opening Stock — at cost", "3", money(openingStock), "")}
  ${colrow("Less: Closing Stock — at cost", "3", neg(closingStock), "")}
  ${rule(true)}
  ${colrow("Cost of Goods Sold", "", "", money(cogs), true, "#f2f2f2")}
  ${blank()}
  ${rule(true)}
  ${colrow("Gross Profit", "", "", money(grossProfit), true, "#e6e6e6")}
  ${rule(true)}

  <!-- III. OPERATING EXPENSES -->
  ${blank()}
  ${head("III.  Operating Expenses")}
  ${colrow("A.  Selling &amp; Distribution Expenses", "", "", "")}
  ${sellingLines.map(([cat, amt]) => colrow(`&nbsp;&nbsp;&nbsp;&nbsp;${cat}`, "", money(amt), "")).join("")}
  ${colrow("&nbsp;&nbsp;&nbsp;&nbsp;Sub-total — Selling", "", "", money(sellingExp), false, "#f9f9f9")}
  ${blank()}
  ${colrow("B.  General &amp; Administrative Expenses", "", "", "")}
  ${gaLines.length > 0
    ? gaLines.map(([cat, amt]) => colrow(`&nbsp;&nbsp;&nbsp;&nbsp;${cat}`, "", money(amt), "")).join("")
    : colrow("&nbsp;&nbsp;&nbsp;&nbsp;Nil recorded for this period", "", "—", "")}
  ${colrow("&nbsp;&nbsp;&nbsp;&nbsp;Sub-total — G&amp;A", "", "", money(gaExp), false, "#f9f9f9")}
  ${blank()}
  ${colrow("C.  Depreciation &amp; Amortisation", "4", "", "—")}
  ${rule(true)}
  ${colrow("Total Operating Expenses", "", "", money(totalOpEx), true, "#f2f2f2")}

  <!-- EBITDA / EBIT / EBT -->
  ${blank()}
  ${rule(true)}
  ${colrow("EBITDA  (Earnings Before Interest, Tax, D&A)", "", "", money(ebitda), true, "#eef3ee")}
  ${colrow("Less: Depreciation &amp; Amortisation", "4", "", "—")}
  ${rule()}
  ${colrow("EBIT  (Earnings Before Interest &amp; Tax)", "", "", money(ebit), true, "#eef3ee")}
  ${colrow("Less: Finance Costs / Interest Expense", "5", "", "—")}
  ${rule()}
  ${colrow("EBT  (Profit Before Tax)", "", "", money(ebt), true, "#f2f2f2")}
  ${colrow("Less: Income Tax Provision @ 25%", "6", "", taxProvision > 0 ? neg(taxProvision) : "—")}
  ${rule(true)}
  ${row(pat >= 0 ? "Net Profit for the Year (PAT)" : "Net Loss for the Year", "", "", money(pat), { bold: true, bg: "#111", doubleUnder: false })}
  ${rule(true)}

  <!-- APPROPRIATION -->
  ${sc > 0 ? `
  ${blank()}
  ${head("IV.  Appropriation of Profit")}
  ${colrow("Net Profit After Tax (brought forward)", "", money(pat), "")}
  ${colrow(`Less: Social Impact Contribution (${impactPct}%)`, "7", neg(sc), "")}
  ${rule(true)}
  ${colrow("Retained Profit transferred to Capital Account", "", "", money(retained), true, "#f2f2f2")}
  ` : ""}

</table>

<!-- ── NOTES ──────────────────────────────────────────── -->
<div style="margin-top:14px;border-top:1.5px solid #000;padding-top:8px;">
  <div style="font-size:8.5pt;font-weight:bold;margin-bottom:5px;letter-spacing:0.05em;text-transform:uppercase;">Notes to the Financial Statement</div>
  <table class="notes-table">
    <tr>${td("1.", { bold: true, size: "8pt", pad: "3px 6px" })}${td("Basis of preparation: This statement is prepared on an accrual basis for the Nepali fiscal year ${fy} BS (Shrawan 1 &ndash; Ashadh end), in accordance with generally accepted accounting principles applicable to sole proprietorships in Nepal.", { size: "8pt", pad: "3px 6px" })}</tr>
    <tr>${td("2.", { bold: true, size: "8pt", pad: "3px 6px" })}${td("VAT: Output VAT of NRS ${money(totalVat)} collected from customers is excluded from revenue. This amount constitutes a statutory liability payable in full to the Inland Revenue Department (IRD), Government of Nepal, and is not income of the business.", { size: "8pt", pad: "3px 6px" })}</tr>
    <tr>${td("3.", { bold: true, size: "8pt", pad: "3px 6px" })}${td("Inventory: Stocks are valued at cost price on a first-in, first-out (FIFO) basis. Closing stock detail is set out in Schedule 2a of the Annual Audit Report for FY ${fy} BS.", { size: "8pt", pad: "3px 6px" })}</tr>
    <tr>${td("4.", { bold: true, size: "8pt", pad: "3px 6px" })}${td("Depreciation &amp; Amortisation: The business holds no capitalised fixed assets during this period. Accordingly, no charge for depreciation or amortisation has been recognised. EBITDA equals EBIT.", { size: "8pt", pad: "3px 6px" })}</tr>
    <tr>${td("5.", { bold: true, size: "8pt", pad: "3px 6px" })}${td("Finance costs: The business carries no external borrowings or finance leases. No interest expense has been incurred during the period.", { size: "8pt", pad: "3px 6px" })}</tr>
    <tr>${td("6.", { bold: true, size: "8pt", pad: "3px 6px" })}${td("Taxation: The business is a sole proprietorship. Income tax is assessed on the proprietor's personal income at applicable slab rates under the Nepal Income Tax Act 2058. The provision shown at 25% is an indicative estimate only and is subject to final IRD assessment.", { size: "8pt", pad: "3px 6px" })}</tr>
    ${sc > 0 ? `<tr>${td("7.", { bold: true, size: "8pt", pad: "3px 6px" })}${td(`Social Impact Contribution: The business voluntarily allocates ${impactPct}% of net profit to a social impact fund as part of its responsible business practice. This appropriation reduces retained profit transferred to the capital account.`, { size: "8pt", pad: "3px 6px" })}</tr>` : ""}
  </table>
</div>

<!-- ── SIGNATURES ─────────────────────────────────────── -->
<div style="margin-top:20px;">
  <table class="sig-table">
    <tr>
      <td>
        <div class="sig-line"></div>
        <div style="font-size:9pt;font-weight:bold;">Proprietor / Authorised Signatory</div>
        <div style="font-size:8pt;color:#555;">The Aavira &mdash; Fashion Retail, Nepal</div>
        <div style="font-size:8pt;color:#555;margin-top:2px;">Date: ___________________</div>
      </td>
      <td>
        <div class="sig-line"></div>
        <div style="font-size:9pt;font-weight:bold;">Prepared / Verified by</div>
        <div style="font-size:8pt;color:#555;">Name &amp; Designation: ___________________</div>
        <div style="font-size:8pt;color:#555;margin-top:2px;">Date: ___________________</div>
      </td>
    </tr>
  </table>
</div>

<!-- ── FOOTER ─────────────────────────────────────────── -->
<div class="footer">
  <span class="footer-l">The Aavira &mdash; Statement of Profit &amp; Loss &mdash; FY ${fy} BS &mdash; CONFIDENTIAL &amp; PRIVILEGED</span>
  <span class="footer-r">Prepared: ${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })} &nbsp;|&nbsp; All amounts in Nepalese Rupees (NRS)</span>
</div>

<script>window.onload = () => { window.print(); };</script>
</body></html>`;
  };

  const handlePL = () => {
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) { toast.error("Pop-up blocked — allow pop-ups for this site."); return; }
    win.document.write(buildPLHTML());
    win.document.close();
  };

  const { start, end } = selectedFY ? fiscalYearRange(selectedFY) : { start: new Date(), end: new Date() };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        Loading audit data…
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 print:px-0 print:py-0">
      {/* Header — hidden when printing */}
      <div className="print:hidden">
        <AdminPageHeader
          title={auditTitle(selectedFY)}
          description="Auto-generated audit report per Nepali fiscal year — Shrawan 1 to Ashadh end."
        />

        <div className="flex flex-wrap items-center gap-3 mt-4 mb-8">
          <select
            className="border rounded px-3 py-1.5 text-sm bg-background"
            value={selectedFY}
            onChange={(e) => setSelectedFY(Number(e.target.value))}
          >
            {availableFYs.map((fy) => (
              <option key={fy} value={fy}>
                आर्थिक वर्ष {fiscalYearLabel(fy)} BS{fy === currentFiscalYear() ? " (current)" : ""}
              </option>
            ))}
          </select>

          <Button variant="outline" size="sm" onClick={() => { setLoading(true); load(); }}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Refresh
          </Button>

          <Button variant="outline" size="sm" onClick={handlePrint}>
            Print
          </Button>

          <Button size="sm" onClick={handlePDF}>
            <Download className="w-3.5 h-3.5 mr-1.5" />
            Download PDF
          </Button>

          <Button variant="outline" size="sm" onClick={handlePL}>
            <Download className="w-3.5 h-3.5 mr-1.5" />
            P&amp;L Statement
          </Button>
        </div>
      </div>

      {/* ── Printable report ──────────────────────────────────────────────── */}
      <div ref={printRef} className="bg-white rounded-xl border border-border p-8 print:border-0 print:rounded-none print:p-6 print:shadow-none font-serif">

        {/* Cover */}
        <div className="text-center mb-10 print:mb-8">
          <img src="/Aavira.png" alt="The Aavira" className="w-20 h-20 object-contain mx-auto mb-3" />
          <h1 className="text-2xl font-bold tracking-tight">The Aavira</h1>
          <p className="text-sm text-muted-foreground mt-1">Annual Financial Audit Report</p>
          <p className="text-lg font-semibold mt-2">आर्थिक वर्ष {fiscalYearLabel(selectedFY)} BS</p>
          <p className="text-xs text-muted-foreground mt-1">
            {start.toLocaleDateString("en-NP", { day: "numeric", month: "long", year: "numeric" })} —{" "}
            {end.toLocaleDateString("en-NP", { day: "numeric", month: "long", year: "numeric" })}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">Generated: {new Date().toLocaleDateString("en-NP", { day: "numeric", month: "long", year: "numeric" })}</p>
        </div>

        <div className="border-t border-border mb-8" />

        {/* ── 1. Revenue Summary ── */}
        <Section title="1. Revenue Summary">
          <Row label="Gross revenue (all orders)" value={fmt(grossRevenue)} />
          <Row indent label="— Delivery fees collected" value={fmt(totalDelivery)} />
          <Row indent label="— VAT collected" value={fmt(totalVat)} />
          <Row indent label="— Discounts given" value={fmt(totalDiscounts)} />
          <Row label="Net product revenue" value={fmt(netProductRevenue)} bold />
          <div className="mt-1" />
          <Row label="Total orders" value={activeOrders.length.toString()} />
          <Row label="Cancelled / returned orders" value={cancelledOrders.length.toString()} />
          <Row label="Total units sold" value={activeOrders.reduce((s, o) => s + Number(o.quantity), 0).toString()} />
        </Section>

        {/* ── 2. Cost of Goods Sold ── */}
        <Section title="2. Cost of Goods Sold (COGS)">
          <Row label="Inventory cost of items sold" value={fmt(cogs)} />
          <Row label="Gross profit" value={fmt(grossProfit)} bold highlight />
          <Row label="Gross margin" value={pct(grossProfit, netProductRevenue)} />
        </Section>

        {/* ── 3. Operating Expenses ── */}
        <Section title="3. Operating Expenses">
          {expenseByCategory.length === 0 && (
            <p className="text-xs text-muted-foreground">No expenses recorded for this period.</p>
          )}
          {expenseByCategory.map(([cat, amt]) => (
            <Row key={cat} label={cat} value={fmt(amt)} indent />
          ))}
          <Row label="Total operating expenses" value={fmt(opExpenses)} bold />
        </Section>

        {/* ── 4. Marketing Expenses ── */}
        <Section title="4. Marketing / Ad Spend">
          <Row label="Total ad spend" value={fmt(adExpenses)} bold />
        </Section>

        {/* ── 5. Social Contribution ── */}
        <Section title={`5. Social Contribution (${impactPct}% of operating profit)`}>
          <Row label="Calculated contribution" value={fmt(Math.max(0, socialContrib))} bold />
        </Section>

        {/* ── 6. Profit Summary ── */}
        <Section title="6. Profit Summary">
          <Row label="Net product revenue" value={fmt(netProductRevenue)} />
          <Row label="Total expenses (COGS + ops + ads + social)" value={fmt(totalExpenses)} />
          <Row label="Net profit / (loss)" value={fmt(netProfit)} bold highlight />
          <Row label="Net margin" value={pct(netProfit, netProductRevenue)} />
        </Section>

        {/* ── 7. VAT Statement ── */}
        {totalVat > 0 && (
          <Section title="7. VAT Statement">
            <Row label="Total VAT collected from customers" value={fmt(totalVat)} bold />
            <p className="text-xs text-muted-foreground mt-2">
              VAT was applied to the product subtotal only. Delivery fees are VAT-exempt.
            </p>
          </Section>
        )}

        {/* ── 8. Orders by Channel ── */}
        <Section title={`${totalVat > 0 ? "8" : "7"}. Orders by Sales Channel`}>
          {ordersBySource.map(([src, { count, revenue }]) => (
            <Row key={src} label={src.charAt(0).toUpperCase() + src.slice(1)} value={`${count} orders · ${fmt(revenue)}`} indent />
          ))}
        </Section>

        {/* ── 9. Top Products ── */}
        <Section title={`${totalVat > 0 ? "9" : "8"}. Top Products by Revenue`}>
          {topProducts.map((p, i) => (
            <Row key={p.name} label={`${i + 1}. ${p.name}`} value={`${p.units} units · ${fmt(p.revenue)}`} indent />
          ))}
        </Section>

        {/* ── 10. Promo Code Usage ── */}
        {promoUsageInFY.length > 0 && (
          <Section title={`${totalVat > 0 ? "10" : "9"}. Promo Code Usage`}>
            {promoUsageInFY.map(([code, count]) => {
              const info = promoCodes.find((p) => p.code === code);
              return (
                <Row
                  key={code}
                  label={`${code}${info ? ` (${info.discount_percent}% off)` : ""}`}
                  value={`${count} use${count !== 1 ? "s" : ""} this FY`}
                  indent
                />
              );
            })}
          </Section>
        )}

        {/* Footer */}
        <div className="border-t border-border mt-10 pt-4 text-center">
          <p className="text-xs text-muted-foreground">
            This report is auto-generated from The Aavira's order management system.
            All figures in Nepalese Rupees (NRS). Fiscal year follows the Nepali calendar (Shrawan 1 – Ashadh end).
          </p>
          <p className="text-xs text-muted-foreground mt-1">Confidential — for internal use only.</p>
        </div>
      </div>

    </div>
  );
}
