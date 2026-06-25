import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
import { DollarSign, RefreshCw, ShoppingCart, Truck, Megaphone, RotateCcw, Package, Trash2, Printer } from "lucide-react";
import { Stat } from "@/components/admin/stat-card";
import { AdminPageHeader } from "@/components/admin/page-header";
import { type Order, STATUS_COLORS, sourceLabel, ORDER_SOURCES } from "@/lib/admin-types";
import { AddOrderDialog } from "@/components/admin/add-order-dialog";

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

function printSlip(group: OrderGroup, storeName: string) {
  const date = new Date(group.createdAt).toLocaleDateString("en-US", {
    day: "numeric", month: "long", year: "numeric",
  });
  const items = group.rows.map((r) => {
    const variant = [r.color, r.size].filter(Boolean).join(", ");
    return `<tr>
      <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb">${r.product_name}${variant ? ` <span style="color:#6b7280;font-size:12px">(${variant})</span>` : ""}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:center">${r.quantity}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:right">NRS ${Number(r.total).toFixed(0)}</td>
    </tr>`;
  }).join("");

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Packing Slip</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:system-ui,sans-serif;font-size:13px;color:#111;padding:32px;max-width:600px;margin:auto}
    h1{font-size:20px;font-weight:700;margin-bottom:2px}
    .sub{color:#6b7280;font-size:12px;margin-bottom:24px}
    .section-label{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;color:#9ca3af;margin-bottom:4px}
    .box{border:1px solid #e5e7eb;border-radius:8px;padding:12px 16px;margin-bottom:16px}
    table{width:100%;border-collapse:collapse;margin-bottom:16px}
    th{text-align:left;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:#9ca3af;padding:0 8px 8px}
    th:last-child,td:last-child{text-align:right}
    th:nth-child(2),td:nth-child(2){text-align:center}
    .total{font-weight:700;font-size:14px;text-align:right;padding-top:8px;border-top:2px solid #111}
    .footer{margin-top:32px;padding-top:16px;border-top:1px dashed #e5e7eb;font-size:11px;color:#9ca3af;text-align:center}
    @media print{@page{margin:20mm}}
  </style></head><body>
  <h1>${storeName}</h1>
  <p class="sub">Packing Slip &nbsp;·&nbsp; ${date} &nbsp;·&nbsp; Order #${group.groupId.slice(0, 8).toUpperCase()}</p>

  <p class="section-label">Ship to</p>
  <div class="box">
    <strong>${group.customerName}</strong><br>
    ${group.customerPhone}<br>
    <span style="color:#6b7280">${group.customerAddress}</span>
  </div>

  <p class="section-label">Items</p>
  <table>
    <thead><tr><th>Product</th><th>Qty</th><th>Amount</th></tr></thead>
    <tbody>${items}</tbody>
  </table>
  <div class="total">Total &nbsp; NRS ${group.groupTotal.toFixed(0)}</div>

  <div class="footer">Thank you for your order! Please handle with care.</div>
  </body></html>`;

  const win = window.open("", "_blank", "width=700,height=900");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
}

function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [bulkSyncing, setBulkSyncing] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [storeName, setStoreName] = useState("Store");

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
        setOrders((data as Order[]) ?? []);
        setSelectedGroupIds(new Set());
      });

  useEffect(() => { load(); }, []);

  useEffect(() => {
    supabase.from("app_settings").select("value").eq("key", "store_name").maybeSingle()
      .then(({ data }) => { if (data?.value) setStoreName(data.value); });
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
    return groups.filter((g) => {
      if (status !== "all" && g.status !== status) return false;
      if (sourceFilter !== "all" && g.source !== sourceFilter) return false;
      if (!q) return true;
      return (
        g.customerName.toLowerCase().includes(q) ||
        g.customerPhone.toLowerCase().includes(q) ||
        g.rows.some((r) => r.product_name.toLowerCase().includes(q))
      );
    });
  }, [groups, search, status, sourceFilter]);

  const allFilteredSelected =
    filteredGroups.length > 0 && filteredGroups.every((g) => selectedGroupIds.has(g.groupId));

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedGroupIds((prev) => {
        const next = new Set(prev);
        filteredGroups.forEach((g) => next.delete(g.groupId));
        return next;
      });
    } else {
      setSelectedGroupIds((prev) => {
        const next = new Set(prev);
        filteredGroups.forEach((g) => next.add(g.groupId));
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
        actions={<AddOrderDialog onCreated={load} />}
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
                {filteredGroups.length} of {groups.length} shown
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {selectedCount > 0 ? (
                <Button
                  variant="destructive"
                  size="sm"
                  className="text-xs h-8 gap-1.5"
                  onClick={() => setDeleteDialogOpen(true)}
                >
                  <Trash2 className="size-3.5" />
                  Delete {selectedCount} selected
                </Button>
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
          {filteredGroups.length > 0 && (
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
                  ? `All ${filteredGroups.length} selected`
                  : selectedCount > 0
                    ? `${selectedCount} selected`
                    : "Select all"}
              </span>
            </div>
          )}

          <div className="divide-y">
            {filteredGroups.map((g) => {
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
                              onClick={() => printSlip(g, storeName)}
                              title="Print packing slip"
                              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-accent"
                            >
                              <Printer className="size-3" /> Print slip
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3">
                          <div className="text-xs text-muted-foreground italic">Not yet sent to Pathao</div>
                          <button
                            type="button"
                            onClick={() => printSlip(g, storeName)}
                            title="Print packing slip"
                            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-accent ml-auto"
                          >
                            <Printer className="size-3" /> Print slip
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
            {filteredGroups.length === 0 && (
              <div className="p-10 text-center text-sm text-muted-foreground">
                {groups.length === 0 ? "No orders yet." : "No orders match your search."}
              </div>
            )}
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
