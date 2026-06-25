import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminPageHeader } from "@/components/admin/page-header";
import { Stat } from "@/components/admin/stat-card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, ShoppingCart, DollarSign, TrendingUp, Phone, MapPin, Search } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/admin/customers")({
  ssr: false,
  component: CustomersPage,
});

type RawOrder = {
  id: string;
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  product_name: string;
  color: string | null;
  size: string | null;
  quantity: number;
  total: number;
  status: string;
  created_at: string;
  order_group_id: string | null;
};

type Customer = {
  phone: string;
  name: string;
  address: string;
  orders: RawOrder[];
  totalSpent: number;
  orderCount: number;
  lastOrderAt: string;
};

function buildCustomers(orders: RawOrder[]): Customer[] {
  const map = new Map<string, Customer>();
  for (const o of orders) {
    const key = o.customer_phone;
    if (!map.has(key)) {
      map.set(key, { phone: key, name: o.customer_name, address: o.customer_address, orders: [], totalSpent: 0, orderCount: 0, lastOrderAt: o.created_at });
    }
    const c = map.get(key)!;
    c.orders.push(o);
    if (!["cancelled"].includes(o.status)) c.totalSpent += o.total;
    c.lastOrderAt = c.lastOrderAt > o.created_at ? c.lastOrderAt : o.created_at;
  }
  // orderCount = distinct order groups (one checkout = multiple order rows when cart has multiple items)
  for (const c of map.values()) {
    const groups = new Set(c.orders.map((o) => o.order_group_id ?? o.id));
    c.orderCount = groups.size;
  }
  return [...map.values()].sort((a, b) => b.lastOrderAt.localeCompare(a.lastOrderAt));
}

function statusVariant(s: string): "default" | "secondary" | "destructive" | "outline" {
  if (s === "delivered") return "default";
  if (s === "cancelled") return "destructive";
  if (s === "shipped" || s === "submitted") return "secondary";
  return "outline";
}

function CustomersPage() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<RawOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("orders")
      .select("id,customer_name,customer_phone,customer_address,product_name,color,size,quantity,total,status,created_at,order_group_id")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setOrders((data as RawOrder[]) ?? []);
        setLoading(false);
      });
  }, []);

  const customers = useMemo(() => buildCustomers(orders), [orders]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return customers;
    return customers.filter(
      (c) => c.name.toLowerCase().includes(q) || c.phone.includes(q) || c.address.toLowerCase().includes(q),
    );
  }, [customers, search]);

  const totalRevenue = customers.reduce((s, c) => s + c.totalSpent, 0);
  const returning = customers.filter((c) => c.orderCount > 1).length;

  return (
    <AdminShell email={user?.email}>
      <AdminPageHeader title="Customers" description="All customers derived from order history." />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Stat label="Total customers" value={String(customers.length)} icon={Users} />
        <Stat label="Total revenue" value={`NRS ${totalRevenue.toLocaleString()}`} icon={DollarSign} />
        <Stat label="Returning customers" value={String(returning)} icon={TrendingUp} />
        <Stat label="Total orders" value={String(orders.length)} icon={ShoppingCart} />
      </div>

      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
        <Input
          className="pl-9"
          placeholder="Search by name, phone, or address…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-20 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-muted-foreground text-sm py-12 text-center">
          {customers.length === 0 ? "No customers yet." : "No customers match your search."}
        </p>
      ) : (
        <div className="space-y-3">
          {filtered.map((c) => {
            const isOpen = expanded === c.phone;
            return (
              <Card key={c.phone} className="overflow-hidden">
                <button
                  type="button"
                  className="w-full text-left"
                  onClick={() => setExpanded(isOpen ? null : c.phone)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <CardTitle className="text-base">{c.name}</CardTitle>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><Phone className="size-3" />{c.phone}</span>
                          <span className="flex items-center gap-1 truncate"><MapPin className="size-3 shrink-0" />{c.address}</span>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="font-medium text-sm">NRS {c.totalSpent.toLocaleString()}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {c.orderCount} order{c.orderCount !== 1 ? "s" : ""}
                          {c.orderCount > 1 && <span className="ml-1.5 text-accent font-medium">Returning</span>}
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                </button>

                {isOpen && (
                  <CardContent className="pt-0 pb-4">
                    <div className="border-t pt-4 space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Order history</p>
                      {c.orders.map((o) => (
                        <div key={o.id} className="flex items-center justify-between gap-3 text-sm">
                          <div className="min-w-0">
                            <span className="font-medium truncate">{o.product_name}</span>
                            {(o.color || o.size) && (
                              <span className="text-muted-foreground ml-1">— {[o.color, o.size].filter(Boolean).join(", ")}</span>
                            )}
                            <span className="text-muted-foreground ml-1">×{o.quantity}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-muted-foreground text-xs">{new Date(o.created_at).toLocaleDateString()}</span>
                            <Badge variant={statusVariant(o.status)} className="capitalize text-xs">{o.status}</Badge>
                            <span className="font-medium text-xs">NRS {o.total.toLocaleString()}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </AdminShell>
  );
}
