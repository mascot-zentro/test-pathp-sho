import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { usePagination } from "@/hooks/use-pagination";
import { Pagination } from "@/components/admin/pagination";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { syncOrderStatus, setOrderStatusAdmin, deleteOrders } from "@/lib/pathao.functions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DollarSign, RefreshCw, ShoppingCart, Truck, Megaphone, RotateCcw, Package, Trash2, Printer, Send, Sparkles, Copy, Check } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Stat } from "@/components/admin/stat-card";
import { AdminPageHeader } from "@/components/admin/page-header";
import { type Order, STATUS_COLORS, sourceLabel, ORDER_SOURCES } from "@/lib/admin-types";
import { AddOrderDialog } from "@/components/admin/add-order-dialog";
import { draftPaymentConfirmation, draftAddressConfirmation } from "@/lib/ai.functions";

export const Route = createFileRoute("/admin/orders")({
  ssr: false,
  component: OrdersPage,
});

type OrderGroup = {
  groupId: string;
  rows: Order[];
  consignmentId: string | null;
  pathaoStatus: string | null;
  status: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  source: string;
  createdAt: string;
  groupTotal: number;
  anyRestocked: boolean;
  slipPrinted: boolean;
};

function buildGroups(orders: Order[]): OrderGroup[] {
  const map = new Map<string, Order[]>();
  for (const o of orders) {
    const key = o.order_group_id ?? o.id;
    const arr = map.get(key) ?? [];
    arr.push(o);
    map.set(key, arr);
  }
  return Array.from(map.entries()).map(([groupId, rows]) => {
    const rep = rows[0];
    return {
      groupId,
      rows,
      consignmentId: rep.pathao_consignment_id,
      pathaoStatus: rep.pathao_status,
      status: rep.status,
      customerName: rep.customer_name,
      customerPhone: rep.customer_phone,
      customerAddress: rep.customer_address,
      source: rep.source,
      createdAt: rep.created_at,
      groupTotal: rows.reduce((s, r) => s + Number(r.total), 0),
      anyRestocked: rows.some((r) => r.stock_restocked),
      slipPrinted: rows.some((r) => !!r.slip_printed_at),
    };
  });
}

function pathaoStatusTone(slug: string | null): "default" | "secondary" | "destructive" | "outline" {
  if (!slug) return "outline";
  const s = slug.toLowerCase();
  if (s.includes("deliver")) return "default";
  if (s.includes("cancel") || s.includes("return") || s.includes("hold")) return "destructive";
  return "secondary";
}

function slipCard(group: OrderGroup, storeName: string, compact = false, phone = "", instagram = ""): string {
  const date = new Date(group.createdAt).toLocaleDateString("en-NP", { day: "numeric", month: "short", year: "numeric" });
  const shortId = group.groupId.slice(0, 8).toUpperCase();
  const total = group.groupTotal;

  const deliveryFeeTotal = group.rows.reduce((s, r) => s + Number(r.delivery_fee ?? 0), 0);

  const items = group.rows.map((r) => {
    const variant = [r.color, r.size].filter(Boolean).join(", ");
    // Show unit price × quantity — the pure product cost, no delivery
    const lineTotal = Number(r.total) - Number(r.delivery_fee ?? 0);
    return `<tr>
      <td class="td-product">
        <div class="item-name">${r.product_name}</div>
        ${variant ? `<div class="item-variant">${variant}</div>` : ""}
      </td>
      <td class="td-qty">${r.quantity}</td>
      <td class="td-amt">NRS ${lineTotal.toLocaleString()}</td>
    </tr>`;
  }).join("");

  return `<div class="slip${compact ? " compact" : ""}">
    <div class="slip-header">
      <img class="logo" src="/Aavira.png" alt="${storeName}" />
      <div class="slip-title">ORDER CONFIRMATION</div>
    </div>

    <div class="divider"></div>

    <div class="meta-row">
      <div class="meta-col">
        <div class="meta-label">ORDER</div>
        <div class="meta-value mono">#${shortId}</div>
      </div>
      <div class="meta-col right">
        <div class="meta-label">DATE</div>
        <div class="meta-value">${date}</div>
      </div>
    </div>

    <div class="divider"></div>

    <div class="info-row">
      <div class="info-col">
        <div class="info-label">SHIP TO</div>
        <div class="ship-name">${group.customerName}</div>
        <div class="ship-detail">${group.customerAddress}</div>
        <div class="ship-detail">${group.customerPhone}</div>
      </div>
      <div class="info-col">
        <div class="info-label">PAYMENT</div>
        <div class="ship-name">Cash on delivery</div>
        <div class="cod-badge">PENDING COLLECTION</div>
      </div>
    </div>

    <div class="divider"></div>

    <table>
      <thead>
        <tr>
          <th class="th-product">ITEM</th>
          <th class="th-qty">QTY</th>
          <th class="th-amt">AMOUNT</th>
        </tr>
      </thead>
      <tbody>${items}</tbody>
    </table>

    <div class="divider"></div>

    ${deliveryFeeTotal > 0 ? `<div class="subtotal-row">
      <span class="subtotal-label">Products</span>
      <span class="subtotal-value">NRS ${(total - deliveryFeeTotal).toLocaleString()}</span>
    </div>
    <div class="subtotal-row">
      <span class="subtotal-label">Delivery</span>
      <span class="subtotal-value">NRS ${deliveryFeeTotal.toLocaleString()}</span>
    </div>` : ""}
    <div class="total-row">
      <span class="total-label">Total due</span>
      <span class="total-amount">NRS ${total.toLocaleString()}</span>
    </div>

    <div class="footer-note">
      Thank you for shopping with ${storeName}
      ${(phone || instagram) ? `<div class="footer-contact">${instagram ? `<span>${instagram}</span>` : ""}${phone && instagram ? " &nbsp;·&nbsp; " : ""}${phone ? `<span>${phone}</span>` : ""}</div>` : ""}
    </div>
  </div>`;
}

const SLIP_STYLES = `
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Georgia',serif;font-size:13px;color:#1a1a1a;background:#f5f5f0}
  .slip{background:#fff;border:1px solid #e8e3d8;border-radius:4px;overflow:hidden;margin:24px auto;max-width:540px;box-shadow:0 2px 12px rgba(0,0,0,.08)}
  .slip-header{text-align:center;padding:24px 24px 16px;background:#fff}
  .logo{width:90px;height:90px;object-fit:contain;margin-bottom:8px}
  .slip-title{font-size:9px;font-weight:400;letter-spacing:0.3em;color:#8a7d65;text-transform:uppercase}
  .divider{height:1px;background:#e8e3d8;margin:0 24px}
  .meta-row{display:flex;justify-content:space-between;padding:14px 24px}
  .meta-col{}
  .meta-col.right{text-align:right}
  .meta-label{font-size:8px;font-weight:700;letter-spacing:0.2em;color:#8a7d65;text-transform:uppercase;margin-bottom:4px}
  .meta-value{font-size:13px;font-weight:600;color:#1a1a1a}
  .mono{font-family:monospace;letter-spacing:0.05em}
  .info-row{display:flex;gap:0;padding:14px 24px}
  .info-col{flex:1}
  .info-label{font-size:8px;font-weight:700;letter-spacing:0.2em;color:#8a7d65;text-transform:uppercase;margin-bottom:8px}
  .ship-name{font-size:14px;font-weight:700;color:#1a1a1a;margin-bottom:4px}
  .ship-detail{font-size:11px;color:#555;margin-bottom:2px}
  .cod-badge{display:inline-block;margin-top:6px;font-size:8px;font-weight:700;letter-spacing:0.15em;color:#8a7d65;border:1px solid #d4c9b0;padding:3px 8px;border-radius:2px}
  table{width:100%;border-collapse:collapse}
  th{font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:0.15em;color:#8a7d65;padding:8px 24px;text-align:left}
  .th-qty,.td-qty{text-align:center;width:48px}
  .th-amt,.td-amt{text-align:right;width:110px}
  .td-product,.td-qty,.td-amt{padding:10px 24px;border-bottom:1px solid #f0ece4;vertical-align:top}
  .item-name{font-size:13px;color:#1a1a1a;font-weight:500}
  .item-variant{font-size:11px;color:#8a7d65;margin-top:2px}
  .subtotal-row{display:flex;justify-content:space-between;padding:3px 24px}
  .subtotal-label{font-size:11px;color:#8a7d65}
  .subtotal-value{font-size:11px;color:#8a7d65;tabular-nums}
  .td-qty{font-size:13px;color:#1a1a1a;text-align:center}
  .td-amt{font-size:13px;color:#1a1a1a;font-weight:500;text-align:right}
  .total-row{display:flex;justify-content:space-between;align-items:baseline;padding:12px 24px}
  .total-label{font-family:Georgia,serif;font-style:italic;font-size:14px;color:#1a1a1a}
  .total-amount{font-family:Georgia,serif;font-size:20px;font-weight:700;color:#8a6f3e;letter-spacing:-0.5px}
  .footer-note{text-align:center;font-family:Georgia,serif;font-style:italic;font-size:11px;color:#8a7d65;padding:10px 24px 16px;border-top:1px solid #e8e3d8}
  .footer-contact{font-family:-apple-system,sans-serif;font-style:normal;font-size:10px;color:#8a7d65;margin-top:4px;letter-spacing:0.05em}
`;

const SLIP_STYLES_COMPACT = `
  .slip.compact .slip-header{padding:10px 10px 8px}
  .slip.compact .logo{width:52px;height:52px;margin-bottom:5px}
  .slip.compact .slip-title{font-size:6px;letter-spacing:0.2em}
  .slip.compact .divider{margin:0 10px}
  .slip.compact .meta-row{padding:7px 10px}
  .slip.compact .meta-label{font-size:6px}
  .slip.compact .meta-value{font-size:10px}
  .slip.compact .info-row{padding:7px 10px}
  .slip.compact .info-label{font-size:6px;margin-bottom:4px}
  .slip.compact .ship-name{font-size:10px;margin-bottom:2px}
  .slip.compact .ship-detail{font-size:9px;margin-bottom:1px}
  .slip.compact .cod-badge{font-size:6px;padding:2px 5px;margin-top:4px}
  .slip.compact th{padding:5px 10px;font-size:6px}
  .slip.compact .td-product,.slip.compact .td-qty,.slip.compact .td-amt{padding:5px 10px}
  .slip.compact .item-name{font-size:9px}
  .slip.compact .item-variant{font-size:8px}
  .slip.compact .td-qty,.slip.compact .td-amt{font-size:9px}
  .slip.compact .total-row{padding:6px 10px}
  .slip.compact .total-label{font-size:10px}
  .slip.compact .total-amount{font-size:13px}
  .slip.compact .footer-note{font-size:8px;padding:6px 10px 8px}
`;

async function markPrinted(groupIds: string[]) {
  const now = new Date().toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  await db.from("orders").update({ slip_printed_at: now }).in("order_group_id", groupIds);
  await db.from("orders").update({ slip_printed_at: now }).in("id", groupIds).is("order_group_id", null);
}

function printSlip(group: OrderGroup, storeName: string, onPrinted?: () => void, phone = "", instagram = "") {
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Packing Slip · #${group.groupId.slice(0,8).toUpperCase()}</title>
  <style>${SLIP_STYLES}@media print{body{background:#fff}.slip{margin:0;max-width:100%;box-shadow:none;border:none}@page{margin:12mm}}</style>
  </head><body>
  ${slipCard(group, storeName, false, phone, instagram)}
  </body></html>`;

  const win = window.open("", "_blank", "width=640,height=900");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
  markPrinted([group.groupId]).then(() => onPrinted?.());
}

function printBulkSlips(groups: OrderGroup[], storeName: string, onPrinted?: () => void, phone = "", instagram = "") {
  const slips = groups.map((g) => `<div class="cell">${slipCard(g, storeName, true, phone, instagram)}</div>`).join("");
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Bulk Packing Slips</title>
  <style>
    ${SLIP_STYLES}
    ${SLIP_STYLES_COMPACT}
    *{box-sizing:border-box;margin:0;padding:0}
    html,body{margin:0;padding:0;background:#fff}
    .page{
      display:grid;
      grid-template-columns:1fr 1fr;
      grid-template-rows:repeat(2,50vh);
      width:100vw;
      height:100vh;
    }
    .cell{
      border:1px dashed #aaa;
      padding:3px;
      overflow:hidden;
      height:50vh;
    }
    .slip{margin:0;width:100%;max-width:100%;box-shadow:none;border:none;border-radius:0;height:100%;overflow:hidden}
    @media print{
      @page{margin:0;size:A4 portrait}
      html,body{width:210mm;height:297mm}
      .page{
        width:210mm;height:297mm;
        grid-template-rows:repeat(2,148.5mm);
      }
      .cell{height:148.5mm;border:1px dashed #aaa;page-break-inside:avoid}
      .slip{height:148.5mm}
    }
  </style></head><body>
  <div class="page">${slips}</div>
  </body></html>`;

  const win = window.open("", "_blank", "width=960,height=1100");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
  markPrinted(groups.map((g) => g.groupId)).then(() => onPrinted?.());
}

function OrderMessageTools({ g }: { g: OrderGroup }) {
  const [draft, setDraft] = useState("");
  const [active, setActive] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const paymentFn = useServerFn(draftPaymentConfirmation);
  const addressFn = useServerFn(draftAddressConfirmation);

  const run = async (type: "payment" | "address") => {
    setActive(type);
    setDraft("");
    setCopied(false);
    setLoading(true);
    try {
      const firstName = g.rows[0];
      if (type === "payment") {
        const result = await paymentFn({ data: { customerName: g.customerName, productName: g.rows.map((r) => r.product_name).join(", "), total: g.groupTotal, orderId: g.groupId } });
        setDraft(result);
      } else {
        const result = await addressFn({ data: { customerName: g.customerName, productName: g.rows.map((r) => r.product_name).join(", "), address: g.customerAddress } });
        setDraft(result);
      }
    } finally {
      setLoading(false);
    }
  };

  const copy = () => {
    navigator.clipboard.writeText(draft);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mt-2 space-y-2">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => run("payment")}
          disabled={loading}
          className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-md border transition disabled:opacity-50 ${active === "payment" && draft ? "bg-accent/10 border-accent/30" : "hover:bg-muted/50"}`}
        >
          <Sparkles className="size-3" />
          {loading && active === "payment" ? "Drafting…" : "💳 Payment confirm"}
        </button>
        <button
          type="button"
          onClick={() => run("address")}
          disabled={loading}
          className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-md border transition disabled:opacity-50 ${active === "address" && draft ? "bg-accent/10 border-accent/30" : "hover:bg-muted/50"}`}
        >
          <Sparkles className="size-3" />
          {loading && active === "address" ? "Drafting…" : "📍 Confirm address"}
        </button>
      </div>
      {draft && (
        <div className="space-y-1.5">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            className="text-xs resize-none bg-muted/30"
          />
          <button
            type="button"
            onClick={copy}
            className="flex items-center gap-1.5 text-[11px] border px-2.5 py-1.5 rounded-md hover:bg-muted/50 transition"
          >
            {copied ? <Check className="size-3 text-green-600" /> : <Copy className="size-3" />}
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      )}
    </div>
  );
}

function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [bulkSyncing, setBulkSyncing] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [storeName, setStoreName] = useState("Store");
  const [storePhone, setStorePhone] = useState("");
  const [storeInstagram, setStoreInstagram] = useState("");
  const [sendingReport, setSendingReport] = useState(false);

  const sendDailyReport = async () => {
    setSendingReport(true);
    try {
      const res = await fetch("/cron-daily-summary");
      if (res.ok) toast.success("Daily summary sent to Discord!");
      else toast.error("Failed to send summary.");
    } catch {
      toast.error("Failed to send summary.");
    } finally {
      setSendingReport(false);
    }
  };

  const runSync = useServerFn(syncOrderStatus);
  const runSetStatus = useServerFn(setOrderStatusAdmin);
  const runDelete = useServerFn(deleteOrders);

  const load = () =>
    supabase
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) toast.error(`Couldn't load orders: ${error.message}`);
        setOrders((data as unknown as Order[]) ?? []);
        setSelectedGroupIds(new Set());
      });

  useEffect(() => { load(); }, []);

  useEffect(() => {
    supabase.from("app_settings").select("key,value").in("key", ["store_name", "whatsapp_number", "social_instagram"])
      .then(({ data }) => {
        const m = Object.fromEntries((data ?? []).map((r: { key: string; value: string }) => [r.key, r.value]));
        if (m.store_name) setStoreName(m.store_name);
        if (m.whatsapp_number) {
          const num = String(m.whatsapp_number).replace(/^\+?977/, "");
          setStorePhone(num);
        }
        if (m.social_instagram) {
          const handle = m.social_instagram.replace(/\/$/, "").split("/").pop() ?? "";
          setStoreInstagram(handle.startsWith("@") ? handle : `@${handle}`);
        }
      });
  }, []);

  const groups = useMemo(() => buildGroups(orders), [orders]);

  const isExcludedFromSales = (o: Order) =>
    o.status === "cancelled" || (!!o.pathao_status && /cancel|return/i.test(o.pathao_status));
  const totalSales = orders.filter((o) => !isExcludedFromSales(o)).reduce((s, o) => s + Number(o.total), 0);
  const uniqueConsignments = new Set(orders.map((o) => o.pathao_consignment_id).filter(Boolean)).size;

  const setGroupStatus = async (group: OrderGroup, value: string) => {
    try {
      let anyRestocked = false;
      for (const row of group.rows) {
        const res = (await runSetStatus({
          data: { orderId: row.id, status: value as "pending" | "submitted" | "shipped" | "delivered" | "cancelled" },
        })) as { restocked: boolean };
        if (res.restocked) anyRestocked = true;
      }
      load();
      if (anyRestocked) toast.success("Order cancelled — stock added back automatically.");
    } catch (e) {
      toast.error(`Couldn't update status: ${String(e)}`);
    }
  };

  const refreshGroupStatus = async (group: OrderGroup) => {
    if (!group.consignmentId) return;
    setSyncing(group.groupId);
    try {
      const res = (await runSync({ data: { orderId: group.rows[0].id } })) as {
        pathaoStatus: string | null;
        restocked: boolean;
      };
      load();
      if (res.restocked) toast.success("Order cancelled/returned — stock added back automatically.");
    } catch (e) {
      toast.error(`Couldn't sync: ${String(e)}`);
    } finally {
      setSyncing(null);
    }
  };

  const refreshAllPathaoStatus = async () => {
    const targets = groups.filter(
      (g) => g.consignmentId && !["delivered", "cancelled"].includes((g.pathaoStatus || "").toLowerCase()),
    );
    if (targets.length === 0) { toast.info("No active Pathao shipments to check."); return; }
    setBulkSyncing(true);
    let failed = 0;
    let restockedCount = 0;
    for (const g of targets) {
      try {
        const res = (await runSync({ data: { orderId: g.rows[0].id } })) as { pathaoStatus: string | null; restocked: boolean };
        if (res.restocked) restockedCount += 1;
      } catch { failed += 1; }
    }
    setBulkSyncing(false);
    load();
    if (failed > 0) toast.error(`Checked ${targets.length} shipments — ${failed} failed.`);
    else toast.success(`Checked status for ${targets.length} shipment${targets.length === 1 ? "" : "s"}.`);
    if (restockedCount > 0) toast.success(`Added stock back for ${restockedCount} cancelled/returned order${restockedCount === 1 ? "" : "s"}.`);
  };

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const now = Date.now();
    const dateMs: Record<string, number> = {
      "7d": 7 * 86400000,
      "15d": 15 * 86400000,
      "1m": 30 * 86400000,
      "3m": 90 * 86400000,
    };
    const cutoff = dateFilter !== "all" ? now - dateMs[dateFilter] : null;
    return groups.filter((g) => {
      if (status !== "all" && g.status !== status) return false;
      if (sourceFilter !== "all" && g.source !== sourceFilter) return false;
      if (cutoff !== null && new Date(g.createdAt).getTime() < cutoff) return false;
      if (!q) return true;
      return (
        g.customerName.toLowerCase().includes(q) ||
        g.customerPhone.toLowerCase().includes(q) ||
        g.rows.some((r) => r.product_name.toLowerCase().includes(q))
      );
    });
  }, [groups, search, status, sourceFilter, dateFilter]);

  const { paged: pagedGroups, page, setPage, totalPages, total: filteredTotal, start, end } = usePagination(filteredGroups, 20);

  const allFilteredSelected =
    pagedGroups.length > 0 && pagedGroups.every((g) => selectedGroupIds.has(g.groupId));

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedGroupIds((prev) => {
        const next = new Set(prev);
        pagedGroups.forEach((g) => next.delete(g.groupId));
        return next;
      });
    } else {
      setSelectedGroupIds((prev) => {
        const next = new Set(prev);
        pagedGroups.forEach((g) => next.add(g.groupId));
        return next;
      });
    }
  };

  const toggleSelect = (groupId: string) => {
    setSelectedGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      const selectedGroups = groups.filter((g) => selectedGroupIds.has(g.groupId));
      const allRowIds = selectedGroups.flatMap((g) => g.rows.map((r) => r.id));
      const res = (await runDelete({ data: { orderIds: allRowIds } })) as { deleted: number };
      toast.success(`Deleted ${selectedGroups.length} order${selectedGroups.length === 1 ? "" : "s"}.`);
      load();
      setDeleteDialogOpen(false);
    } catch (e) {
      toast.error(`Delete failed: ${String(e)}`);
    } finally {
      setDeleting(false);
    }
  };

  const selectedCount = selectedGroupIds.size;

  return (
    <div>
      <AdminPageHeader
        title="Orders"
        description="Manage order statuses and track Pathao shipments."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={sendDailyReport} disabled={sendingReport}>
              <Send className="size-3.5 mr-1.5" />
              {sendingReport ? "Sending…" : "Send daily report"}
            </Button>
            <AddOrderDialog onCreated={load} />
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Stat label="Total orders" value={groups.length.toString()} icon={ShoppingCart} tone="accent" />
        <Stat label="Total revenue" value={`NRS ${totalSales.toFixed(0)}`} icon={DollarSign} tone="success" />
        <Stat
          label="Submitted to Pathao"
          value={uniqueConsignments.toString()}
          icon={Truck}
          tone="default"
          sub="courier shipments"
        />
        <Stat
          label="Social media orders"
          value={groups.filter((g) => g.source !== "website").length.toString()}
          icon={Megaphone}
          tone="default"
        />
      </div>

      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <CardTitle className="text-base font-display">All orders</CardTitle>
              <CardDescription className="text-xs mt-0.5">
                {filteredTotal} of {groups.length} shown
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {selectedCount > 0 ? (
                <div className="flex items-center gap-2">
                  {(() => {
                    const selected = groups.filter((g) => selectedGroupIds.has(g.groupId));
                    const unprinted = selected.filter((g) => !g.slipPrinted);
                    return unprinted.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => printBulkSlips(unprinted, storeName, load, storePhone, storeInstagram)}
                        className="text-xs border rounded-lg px-3 py-2 bg-background hover:border-accent hover:text-accent flex items-center gap-1.5 transition-colors"
                      >
                        <Printer className="size-3.5" />
                        Print {unprinted.length} unprinted
                      </button>
                    ) : (
                      <span className="text-xs text-muted-foreground flex items-center gap-1.5 px-3 py-2">
                        <Printer className="size-3.5" /> All slips printed
                      </span>
                    );
                  })()}
                  <Button
                    variant="destructive"
                    size="sm"
                    className="text-xs h-8 gap-1.5"
                    onClick={() => setDeleteDialogOpen(true)}
                  >
                    <Trash2 className="size-3.5" />
                    Delete {selectedCount}
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={refreshAllPathaoStatus}
                  disabled={bulkSyncing}
                  className="text-xs border rounded-lg px-3 py-2 bg-background hover:border-accent hover:text-accent disabled:opacity-40 flex items-center gap-1.5 transition-colors"
                  title="Check Pathao delivery status for all active shipments"
                >
                  <RefreshCw className={`size-3.5 ${bulkSyncing ? "animate-spin" : ""}`} />
                  {bulkSyncing ? "Checking…" : "Sync Pathao"}
                </button>
              )}
              <select
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="text-xs border rounded-lg px-2.5 py-2 bg-background hover:border-accent cursor-pointer transition-colors"
              >
                <option value="all">All time</option>
                <option value="7d">Last 7 days</option>
                <option value="15d">Last 15 days</option>
                <option value="1m">Last month</option>
                <option value="3m">Last 3 months</option>
              </select>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search…"
                className="w-44 pl-3 text-xs"
              />
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="text-xs border rounded-lg px-2.5 py-2 bg-background hover:border-accent cursor-pointer transition-colors"
              >
                <option value="all">All statuses</option>
                <option value="pending">Pending</option>
                <option value="submitted">Submitted</option>
                <option value="shipped">Shipped</option>
                <option value="delivered">Delivered</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                className="text-xs border rounded-lg px-2.5 py-2 bg-background hover:border-accent cursor-pointer transition-colors"
              >
                <option value="all">All sources</option>
                {ORDER_SOURCES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {/* Select-all header — only visible when there are rows */}
          {pagedGroups.length > 0 && (
            <div className="flex items-center gap-3 px-4 sm:px-5 py-2.5 border-t border-b bg-muted/30">
              <input
                type="checkbox"
                checked={allFilteredSelected}
                onChange={toggleSelectAll}
                className="size-4 rounded accent-accent cursor-pointer"
                aria-label="Select all"
              />
              <span className="text-xs text-muted-foreground">
                {allFilteredSelected
                  ? `All ${pagedGroups.length} selected`
                  : selectedCount > 0
                    ? `${selectedCount} selected`
                    : "Select all"}
              </span>
            </div>
          )}

          <div className="divide-y">
            {pagedGroups.map((g) => {
              const isSelected = selectedGroupIds.has(g.groupId);
              return (
                <div
                  key={g.groupId}
                  className={`p-4 sm:p-5 transition flex gap-3 ${isSelected ? "bg-accent/5" : "hover:bg-muted/30"}`}
                >
                  {/* Checkbox */}
                  <div className="pt-0.5 shrink-0">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(g.groupId)}
                      className="size-4 rounded accent-accent cursor-pointer"
                      aria-label="Select order"
                    />
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-start gap-4 flex-1 min-w-0">
                    {/* Items + shipment */}
                    <div className="min-w-0 flex-1 space-y-2.5">
                      <div className="space-y-1">
                        {g.rows.map((r) => (
                          <div key={r.id} className="flex items-baseline gap-1.5">
                            {g.rows.length > 1 && <Package className="size-3 text-muted-foreground shrink-0 mt-0.5" />}
                            <span className="font-semibold text-[15px] leading-snug">
                              {r.product_name}
                              {r.color && <span className="text-muted-foreground font-normal"> · {r.color}</span>}
                              {r.size && <span className="text-muted-foreground font-normal"> · {r.size}</span>}
                              <span className="text-muted-foreground font-normal text-sm"> × {r.quantity}</span>
                            </span>
                          </div>
                        ))}
                        <div className="flex items-center gap-2 mt-0.5">
                          <div className="text-xs text-muted-foreground">
                            {new Date(g.createdAt).toLocaleString()}
                          </div>
                          {g.source && g.source !== "website" && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 font-normal">
                              {sourceLabel(g.source)}
                            </Badge>
                          )}
                          {g.rows.length > 1 && (
                            <span className="text-[10px] text-muted-foreground bg-muted rounded-full px-2 py-0.5">
                              {g.rows.length} items · 1 parcel
                            </span>
                          )}
                          {g.slipPrinted && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 font-normal text-green-700 border-green-300 bg-green-50">
                              Slip printed
                            </Badge>
                          )}
                        </div>
                      </div>

                      {g.consignmentId ? (
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 bg-muted/50 rounded-md px-2.5 py-2">
                          <Truck className="size-3.5 text-accent shrink-0" />
                          <span className="text-xs font-mono text-muted-foreground">#{g.consignmentId}</span>
                          {g.pathaoStatus ? (
                            <Badge variant={pathaoStatusTone(g.pathaoStatus)} className="text-[11px] px-2 py-0.5 capitalize font-medium">
                              {g.pathaoStatus.replace(/_/g, " ")}
                            </Badge>
                          ) : (
                            <span className="text-[11px] text-muted-foreground">No status yet</span>
                          )}
                          {g.anyRestocked && (
                            <span className="text-[11px] text-green-700 flex items-center gap-1" title="Stock was added back automatically">
                              <RotateCcw className="size-3" /> Stock returned
                            </span>
                          )}
                          <div className="ml-auto flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => refreshGroupStatus(g)}
                              disabled={syncing === g.groupId}
                              title="Check latest status from Pathao"
                              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-accent disabled:opacity-40"
                            >
                              <RefreshCw className={`size-3 ${syncing === g.groupId ? "animate-spin" : ""}`} />
                              {syncing === g.groupId ? "Checking…" : "Check status"}
                            </button>
                            <button
                              type="button"
                              onClick={() => printSlip(g, storeName, load, storePhone, storeInstagram)}
                              title="Print packing slip"
                              className={`flex items-center gap-1 text-[11px] hover:text-accent ${g.slipPrinted ? "text-green-600" : "text-muted-foreground"}`}
                            >
                              <Printer className="size-3" /> {g.slipPrinted ? "Printed ✓" : "Print slip"}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3">
                          <div className="text-xs text-muted-foreground italic">Not yet sent to Pathao</div>
                          <button
                            type="button"
                            onClick={() => printSlip(g, storeName, load, storePhone, storeInstagram)}
                            title="Print packing slip"
                            className={`flex items-center gap-1 text-[11px] hover:text-accent ml-auto ${g.slipPrinted ? "text-green-600" : "text-muted-foreground"}`}
                          >
                            <Printer className="size-3" /> {g.slipPrinted ? "Printed ✓" : "Print slip"}
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Customer */}
                    <div className="min-w-0 flex-1 sm:max-w-[260px] space-y-1 sm:border-l sm:pl-4">
                      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Customer</div>
                      <div className="text-sm font-medium truncate">{g.customerName}</div>
                      <div className="text-sm text-muted-foreground">{g.customerPhone}</div>
                      <div className="text-xs text-muted-foreground leading-relaxed">{g.customerAddress}</div>
                      <OrderMessageTools g={g} />
                    </div>

                    {/* Total + status */}
                    <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-2 sm:w-36 sm:border-l sm:pl-4 sm:text-right">
                      <div>
                        <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:text-right">Total</div>
                        <div className="tabular-nums font-bold text-lg leading-tight">NRS {g.groupTotal.toFixed(1)}</div>
                      </div>
                      <select
                        value={g.status}
                        onChange={(e) => setGroupStatus(g, e.target.value)}
                        className="text-xs font-medium border rounded-md pl-2.5 pr-2 py-1.5 bg-background hover:border-accent cursor-pointer capitalize"
                        style={{ borderLeftColor: STATUS_COLORS[g.status] ?? undefined, borderLeftWidth: 3 }}
                      >
                        <option value="pending">Pending</option>
                        <option value="submitted">Submitted</option>
                        <option value="shipped">Shipped</option>
                        <option value="delivered">Delivered</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                    </div>
                  </div>
                </div>
              );
            })}
            {filteredTotal === 0 && (
              <div className="p-10 text-center text-sm text-muted-foreground">
                {groups.length === 0 ? "No orders yet." : "No orders match your search."}
              </div>
            )}
          </div>
          <div className="px-5 pb-4">
            <Pagination page={page} totalPages={totalPages} total={filteredTotal} start={start} end={end} onPage={setPage} label="orders" />
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedCount} order{selectedCount === 1 ? "" : "s"}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the selected order{selectedCount === 1 ? "" : "s"} from your records.
              Stock for any non-cancelled items will be added back automatically.
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting…" : `Delete ${selectedCount} order${selectedCount === 1 ? "" : "s"}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
