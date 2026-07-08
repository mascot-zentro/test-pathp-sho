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
}

interface PromoCode {
  code: string;
  discount_percent: number;
  used_count: number;
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
  const [impactPct, setImpactPct] = useState(5);
  const [loading, setLoading] = useState(true);
  const [selectedFY, setSelectedFY] = useState<number>(currentFiscalYear());
  const printRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    const db = supabase as any;
    const [o, e, a, p, pr, s] = await Promise.all([
      db.from("orders").select("id,created_at,total,delivery_fee,discount_amount,vat_amount,status,pathao_status,product_id,product_name,unit_price,quantity,source,promo_code"),
      db.from("expenses").select("*"),
      db.from("ad_spend").select("*"),
      db.from("products").select("id,name,cost_price"),
      db.from("promo_codes").select("code,discount_percent,used_count"),
      db.from("impact_settings").select("contribution_percentage").limit(1).single(),
    ]);
    if (o.data) setOrders(o.data);
    if (e.data) setExpenses(e.data);
    if (a.data) setAdSpends(a.data);
    if (p.data) setProducts(p.data);
    if (pr.data) setPromoCodes(pr.data);
    if (s.data?.contribution_percentage != null) setImpactPct(Number(s.data.contribution_percentage));
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
  const cogs = useMemo(() => activeOrders.reduce((s, o) => {
    const cost = o.product_id ? (productCostMap[o.product_id] ?? 0) : 0;
    return s + cost * Number(o.quantity);
  }, 0), [activeOrders, productCostMap]);

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

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>${filename}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Times New Roman', Times, serif; font-size: 11pt; color: #000; background: #fff; }

    /* ── Page layout ── */
    .page { padding: 18mm 20mm 16mm; min-height: 297mm; position: relative; }
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
<div class="page" style="display:flex;flex-direction:column;align-items:center;">
  <div class="cover">
    <div class="jurisdiction">Nepal &mdash; Private Business Entity</div>
    <div class="entity-name">The Aavira</div>
    <div class="entity-type">Retail &amp; E-Commerce</div>

    <div class="doc-title-box">
      <div class="doc-title">Annual Internal Financial Audit Report</div>
      <div class="doc-subtitle">Statement of Accounts &amp; Financial Review</div>
    </div>

    <div class="fy-label">Fiscal Year ${fy} BS</div>
    <div class="period">${dateStr(start)} &mdash; ${dateStr(end)}</div>

    <table class="meta">
      <tr><td>Report No.</td><td>AUD-${fy.replace("/", "")}-001</td></tr>
      <tr><td>Prepared by</td><td>The Aavira Management System</td></tr>
      <tr><td>Date Issued</td><td>${dateStr(new Date())}</td></tr>
      <tr><td>Currency</td><td>Nepalese Rupee (NRS)</td></tr>
      <tr><td>Fiscal Standard</td><td>Nepali Calendar (BS)</td></tr>
    </table>

    <div class="confidential">Confidential &mdash; Internal Use Only</div>
  </div>
</div>

<!-- ═══════════════════════ REPORT PAGES ═══════════════════════ -->
<div class="page page-break">

  <div class="report-header">
    <div class="rh-left">
      <div class="rh-entity">The Aavira</div>
      <div class="rh-title">Annual Financial Audit &mdash; FY ${fy} BS</div>
    </div>
    <div class="rh-right">
      Report No.: AUD-${fy.replace("/", "")}-001<br/>
      Issued: ${dateStr(new Date())}<br/>
      Period: ${dateStr(start)} &mdash; ${dateStr(end)}
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
      <tr><td>Opening inventory cost of goods sold</td><td class="val">${fmt(cogs)}</td></tr>
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
      We, the undersigned, confirm that the financial statements and figures contained in this report are, to the best of our knowledge, accurate and complete for the fiscal year ending ${dateStr(end)}.
    </p>
    <div class="sig-grid">
      <div class="sig-box">
        <div class="sig-line"></div>
        <div class="sig-name">Authorised Signatory</div>
        <div class="sig-role">Business Owner / Director</div>
        <div class="sig-date">Date: ___________________</div>
      </div>
      <div class="sig-box">
        <div class="sig-line"></div>
        <div class="sig-name">Prepared By</div>
        <div class="sig-role">The Aavira Management System</div>
        <div class="sig-date">Date: ${dateStr(new Date())}</div>
      </div>
    </div>
  </div>

  <div class="page-footer">
    <div>The Aavira &mdash; Annual Audit Report FY ${fy} BS &mdash; CONFIDENTIAL</div>
    <div>All figures in NRS &bull; Nepali Fiscal Year (Shrawan 1 &ndash; Ashadh end)</div>
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
