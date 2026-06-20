import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { syncOrderStatus } from "@/lib/pathao.functions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DollarSign, RefreshCw, ShoppingCart, Truck, Megaphone, RotateCcw } from "lucide-react";
import { Stat } from "@/components/admin/stat-card";
import { AdminPageHeader } from "@/components/admin/page-header";
import { type Order, STATUS_COLORS, sourceLabel, ORDER_SOURCES } from "@/lib/admin-types";
import { AddOrderDialog } from "@/components/admin/add-order-dialog";

export const Route = createFileRoute("/admin/orders")({
  ssr: false,
  component: OrdersPage,
});

function pathaoStatusTone(slug: string | null): "default" | "secondary" | "destructive" | "outline" {
  if (!slug) return "outline";
  const s = slug.toLowerCase();
  if (s.includes("deliver")) return "default";
  if (s.includes("cancel") || s.includes("return") || s.includes("hold")) return "destructive";
  return "secondary";
}

function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [bulkSyncing, setBulkSyncing] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const runSync = useServerFn(syncOrderStatus);

  const load = () =>
    supabase
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) toast.error(`Couldn't load orders: ${error.message}`);
        setOrders((data as Order[]) ?? []);
      });
  useEffect(() => {
    load();
  }, []);

  const setOrderStatus = async (id: string, value: string) => {
    await supabase.from("orders").update({ status: value }).eq("id", id);
    load();
  };

  const refreshPathaoStatus = async (id: string) => {
    setSyncing(id);
    try {
      const res = (await runSync({ data: { orderId: id } })) as { pathaoStatus: string | null; restocked: boolean };
      load();
      if (res.restocked) toast.success("Order cancelled/returned — stock added back automatically.");
    } catch (e) {
      toast.error(`Couldn't sync: ${String(e)}`);
    } finally {
      setSyncing(null);
    }
  };

  // Checks Pathao status for every order that has a consignment and isn't
  // already in a terminal state, one at a time to stay easy on the API.
  const refreshAllPathaoStatus = async () => {
    const targets = orders.filter(
      (o) => o.pathao_consignment_id && !["delivered", "cancelled"].includes((o.pathao_status || "").toLowerCase())
    );
    if (targets.length === 0) {
      toast.info("No active Pathao shipments to check.");
      return;
    }
    setBulkSyncing(true);
    let failed = 0;
    let restockedCount = 0;
    for (const o of targets) {
      try {
        const res = (await runSync({ data: { orderId: o.id } })) as { pathaoStatus: string | null; restocked: boolean };
        if (res.restocked) restockedCount += 1;
      } catch {
        failed += 1;
      }
    }
    setBulkSyncing(false);
    load();
    if (failed > 0) toast.error(`Checked ${targets.length} orders — ${failed} failed.`);
    else toast.success(`Checked status for ${targets.length} order${targets.length === 1 ? "" : "s"}.`);
    if (restockedCount > 0) toast.success(`Added stock back for ${restockedCount} cancelled/returned order${restockedCount === 1 ? "" : "s"}.`);
  };

  // Excludes orders cancelled either through the admin's own status field
  // OR reported cancelled/returned by the courier. syncOrderStatus now
  // keeps these in sync going forward, but this also protects against
  // orders that haven't been re-synced since a courier-side cancellation
  // (e.g. right after a "Pickup Cancelled" event, before the next sync).
  const isExcludedFromSales = (o: Order) =>
    o.status === "cancelled" || (!!o.pathao_status && /cancel|return/i.test(o.pathao_status));
  const totalSales = orders
    .filter((o) => !isExcludedFromSales(o))
    .reduce((s, o) => s + Number(o.total), 0);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      if (status !== "all" && o.status !== status) return false;
      if (sourceFilter !== "all" && o.source !== sourceFilter) return false;
      if (!q) return true;
      return (
        o.product_name.toLowerCase().includes(q) ||
        o.customer_name.toLowerCase().includes(q) ||
        o.customer_phone.toLowerCase().includes(q)
      );
    });
  }, [orders, search, status, sourceFilter]);

  return (
    <div>
      <AdminPageHeader
        title="Orders"
        description="Manage order statuses and track Pathao shipments."
        actions={<AddOrderDialog onCreated={load} />}
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Stat
          label="Total orders"
          value={orders.length.toString()}
          icon={ShoppingCart}
          tone="accent"
        />
        <Stat
          label="Total sales"
          value={`NRS ${totalSales.toFixed(0)}`}
          icon={DollarSign}
          tone="success"
        />
        <Stat
          label="Submitted to Pathao"
          value={orders.filter((o) => o.pathao_consignment_id).length.toString()}
          icon={Truck}
          tone="default"
        />
        <Stat
          label="Social media orders"
          value={orders.filter((o) => o.source !== "website").length.toString()}
          icon={Megaphone}
          tone="default"
        />
      </div>

      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">All orders</CardTitle>
              <CardDescription>
                {filtered.length} of {orders.length} shown
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={refreshAllPathaoStatus}
                disabled={bulkSyncing}
                className="text-xs border rounded-md px-2.5 py-2 bg-background hover:border-accent hover:text-accent disabled:opacity-40 flex items-center gap-1.5"
                title="Check Pathao status for every active shipment"
              >
                <RefreshCw className={`size-3.5 ${bulkSyncing ? "animate-spin" : ""}`} />
                {bulkSyncing ? "Checking…" : "Check all"}
              </button>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search product or customer…"
                className="w-56"
              />
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="text-xs border rounded-md px-2 py-2 bg-background hover:border-accent cursor-pointer"
              >
                <option value="all">All statuses</option>
                <option value="pending">pending</option>
                <option value="submitted">submitted</option>
                <option value="shipped">shipped</option>
                <option value="delivered">delivered</option>
                <option value="cancelled">cancelled</option>
              </select>
              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                className="text-xs border rounded-md px-2 py-2 bg-background hover:border-accent cursor-pointer"
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
          <div className="divide-y border-t">
            {filtered.map((o) => (
              <div key={o.id} className="p-4 sm:p-5 hover:bg-muted/30 transition">
                <div className="flex flex-col sm:flex-row sm:items-start gap-4">

                  {/* Product + shipment */}
                  <div className="min-w-0 flex-1 space-y-2.5">
                    <div>
                      <div className="font-semibold text-[15px] leading-snug">
                        {o.product_name}
                        {o.color && <span className="text-muted-foreground font-normal"> · {o.color}</span>}
                        {o.size && <span className="text-muted-foreground font-normal"> · {o.size}</span>}
                        <span className="text-muted-foreground font-normal text-sm"> × {o.quantity}</span>
                        {o.source && o.source !== "website" && (
                          <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0 h-5 align-middle font-normal">
                            {sourceLabel(o.source)}
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {new Date(o.created_at).toLocaleString()}
                      </div>
                    </div>

                    {o.pathao_consignment_id ? (
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 bg-muted/50 rounded-md px-2.5 py-2">
                        <Truck className="size-3.5 text-accent shrink-0" />
                        <span className="text-xs font-mono text-muted-foreground">#{o.pathao_consignment_id}</span>
                        {o.pathao_status ? (
                          <Badge variant={pathaoStatusTone(o.pathao_status)} className="text-[11px] px-2 py-0.5 capitalize font-medium">
                            {o.pathao_status.replace(/_/g, " ")}
                          </Badge>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">No status yet</span>
                        )}
                        {o.stock_restocked && (
                          <span className="text-[11px] text-green-700 flex items-center gap-1" title="Stock was added back automatically">
                            <RotateCcw className="size-3" /> Stock returned
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => refreshPathaoStatus(o.id)}
                          disabled={syncing === o.id}
                          title="Check latest status from Pathao"
                          className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-accent disabled:opacity-40 ml-auto"
                        >
                          <RefreshCw className={`size-3 ${syncing === o.id ? "animate-spin" : ""}`} />
                          {syncing === o.id ? "Checking…" : "Check status"}
                        </button>
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground italic">Not yet sent to Pathao</div>
                    )}
                  </div>

                  {/* Customer */}
                  <div className="min-w-0 flex-1 sm:max-w-[260px] space-y-1 sm:border-l sm:pl-4">
                    <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Customer</div>
                    <div className="text-sm font-medium truncate">{o.customer_name}</div>
                    <div className="text-sm text-muted-foreground">{o.customer_phone}</div>
                    <div className="text-xs text-muted-foreground leading-relaxed">{o.customer_address}</div>
                  </div>

                  {/* Total + status control */}
                  <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-2 sm:w-36 sm:border-l sm:pl-4 sm:text-right">
                    <div>
                      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:text-right">Total</div>
                      <div className="tabular-nums font-bold text-lg leading-tight">NRS {o.total}</div>
                    </div>
                    <select
                      value={o.status}
                      onChange={(e) => setOrderStatus(o.id, e.target.value)}
                      className="text-xs font-medium border rounded-md pl-2.5 pr-2 py-1.5 bg-background hover:border-accent cursor-pointer capitalize"
                      style={{ borderLeftColor: STATUS_COLORS[o.status] ?? undefined, borderLeftWidth: 3 }}
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
            ))}
            {filtered.length === 0 && (
              <div className="p-10 text-center text-sm text-muted-foreground">
                {orders.length === 0 ? "No orders yet." : "No orders match your search."}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
