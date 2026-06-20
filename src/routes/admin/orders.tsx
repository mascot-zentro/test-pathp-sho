import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { syncOrderStatus } from "@/lib/pathao.functions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DollarSign, RefreshCw, ShoppingCart, Truck } from "lucide-react";
import { Stat } from "@/components/admin/stat-card";
import { AdminPageHeader } from "@/components/admin/page-header";
import { type Order, statusVariant } from "@/lib/admin-types";

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
      await runSync({ data: { orderId: id } });
      load();
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
    for (const o of targets) {
      try {
        await runSync({ data: { orderId: o.id } });
      } catch {
        failed += 1;
      }
    }
    setBulkSyncing(false);
    load();
    if (failed > 0) toast.error(`Checked ${targets.length} orders — ${failed} failed.`);
    else toast.success(`Checked status for ${targets.length} order${targets.length === 1 ? "" : "s"}.`);
  };

  const totalSales = orders
    .filter((o) => o.status !== "cancelled")
    .reduce((s, o) => s + Number(o.total), 0);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      if (status !== "all" && o.status !== status) return false;
      if (!q) return true;
      return (
        o.product_name.toLowerCase().includes(q) ||
        o.customer_name.toLowerCase().includes(q) ||
        o.customer_phone.toLowerCase().includes(q)
      );
    });
  }, [orders, search, status]);

  return (
    <div>
      <AdminPageHeader
        title="Orders"
        description="Manage order statuses and track Pathao shipments."
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
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
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y border-t">
            {filtered.map((o) => (
              <div
                key={o.id}
                className="p-4 grid md:grid-cols-[1.2fr,1fr,auto] gap-3 items-center hover:bg-muted/30 transition"
              >
                <div className="min-w-0">
                  <div className="font-medium truncate">
                    {o.product_name}
                    {o.color && <span className="text-muted-foreground"> · {o.color}</span>}
                    {o.size && <span className="text-muted-foreground"> · {o.size}</span>}
                    <span className="text-xs text-muted-foreground ml-1">× {o.quantity}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(o.created_at).toLocaleString()}
                  </div>
                  {o.pathao_consignment_id && (
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <Truck className="size-3 text-accent shrink-0" />
                      <span className="text-xs text-muted-foreground">#{o.pathao_consignment_id}</span>
                      {o.pathao_status ? (
                        <Badge variant={pathaoStatusTone(o.pathao_status)} className="text-[10px] px-1.5 py-0 h-5 capitalize font-normal">
                          {o.pathao_status.replace(/_/g, " ")}
                        </Badge>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">no status yet</span>
                      )}
                      <button
                        type="button"
                        onClick={() => refreshPathaoStatus(o.id)}
                        disabled={syncing === o.id}
                        title="Check latest status from Pathao"
                        className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-accent disabled:opacity-40 ml-0.5"
                      >
                        <RefreshCw className={`size-3 ${syncing === o.id ? "animate-spin" : ""}`} />
                        {syncing === o.id ? "Checking…" : "Check status"}
                      </button>
                    </div>
                  )}
                </div>
                <div className="text-sm min-w-0">
                  <div className="truncate">
                    {o.customer_name} · {o.customer_phone}
                  </div>
                  <div className="text-muted-foreground text-xs truncate">{o.customer_address}</div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="tabular-nums font-semibold">NRS {o.total}</div>
                    <Badge variant={statusVariant(o.status)} className="capitalize mt-1">
                      {o.status.replace(/_/g, " ")}
                    </Badge>
                  </div>
                  <select
                    value={o.status}
                    onChange={(e) => setOrderStatus(o.id, e.target.value)}
                    className="text-xs border rounded-md px-2 py-1.5 bg-background hover:border-accent cursor-pointer"
                  >
                    <option value="pending">pending</option>
                    <option value="submitted">submitted</option>
                    <option value="shipped">shipped</option>
                    <option value="delivered">delivered</option>
                    <option value="cancelled">cancelled</option>
                  </select>
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
