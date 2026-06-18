import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, Package, ShoppingCart, TrendingUp } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { Stat } from "@/components/admin/stat-card";
import { AdminPageHeader } from "@/components/admin/page-header";
import { type Order, STATUS_COLORS } from "@/lib/admin-types";

export const Route = createFileRoute("/admin/dashboard")({
  ssr: false,
  component: DashboardPage,
});

const RANGES = [
  { label: "7 days", days: 7 },
  { label: "14 days", days: 14 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
];

function DashboardPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [rangeDays, setRangeDays] = useState(14);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [productFilter, setProductFilter] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) toast.error(`Couldn't load orders: ${error.message}`);
        setOrders((data as Order[]) ?? []);
        setLoading(false);
      });
  }, []);

  const rangePicker = (
    <div className="inline-flex rounded-md border bg-card p-0.5 text-xs">
      {RANGES.map((r) => (
        <button
          key={r.days}
          onClick={() => setRangeDays(r.days)}
          className={`px-3 py-1.5 rounded transition ${rangeDays === r.days ? "bg-accent text-accent-foreground" : "hover:bg-muted"}`}
        >
          {r.label}
        </button>
      ))}
    </div>
  );

  if (loading) {
    return (
      <div>
        <AdminPageHeader
          title="Dashboard"
          description="Live snapshot of orders and revenue."
          actions={rangePicker}
        />
        <p className="text-muted-foreground text-sm">Loading…</p>
      </div>
    );
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - rangeDays + 1);
  cutoff.setHours(0, 0, 0, 0);
  const inRange = orders.filter((o) => new Date(o.created_at) >= cutoff);
  const validOrders = inRange.filter((o) => o.status !== "cancelled");
  const totalRevenue = validOrders.reduce((s, o) => s + Number(o.total), 0);
  const unitsSold = validOrders.reduce((s, o) => s + Number(o.quantity), 0);
  const avgOrder = validOrders.length ? totalRevenue / validOrders.length : 0;
  const pending = inRange.filter((o) => o.status === "pending").length;

  const prevCutoff = new Date(cutoff);
  prevCutoff.setDate(prevCutoff.getDate() - rangeDays);
  const prevValid = orders.filter((o) => {
    const d = new Date(o.created_at);
    return d >= prevCutoff && d < cutoff && o.status !== "cancelled";
  });
  const prevRevenue = prevValid.reduce((s, o) => s + Number(o.total), 0);
  const revenueDelta = prevRevenue ? ((totalRevenue - prevRevenue) / prevRevenue) * 100 : null;

  const days: { date: string; revenue: number; orders: number }[] = [];
  for (let i = rangeDays - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dayStr = d.toDateString();
    const todays = validOrders.filter((o) => new Date(o.created_at).toDateString() === dayStr);
    days.push({
      date: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      revenue: todays.reduce((s, o) => s + Number(o.total), 0),
      orders: todays.length,
    });
  }

  const byProduct = new Map<string, { qty: number; revenue: number }>();
  validOrders.forEach((o) => {
    const cur = byProduct.get(o.product_name) ?? { qty: 0, revenue: 0 };
    cur.qty += o.quantity;
    cur.revenue += Number(o.total);
    byProduct.set(o.product_name, cur);
  });
  const topProducts = [...byProduct.entries()]
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .slice(0, 5)
    .map(([name, v]) => ({ name, ...v }));

  const statusCounts: { name: string; value: number; fill: string }[] = Object.keys(STATUS_COLORS)
    .map((s) => ({
      name: s,
      value: inRange.filter((o) => o.status === s).length,
      fill: STATUS_COLORS[s],
    }))
    .filter((s) => s.value > 0);

  const drillOrders = inRange
    .filter(
      (o) =>
        (!statusFilter || o.status === statusFilter) &&
        (!productFilter || o.product_name === productFilter),
    )
    .slice(0, 25);

  const clearFilters = () => {
    setStatusFilter(null);
    setProductFilter(null);
  };
  const hasFilter = statusFilter || productFilter;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Dashboard"
        description="Click a chart segment to drill into orders below."
        actions={rangePicker}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat
          label="Revenue"
          value={`NRS ${totalRevenue.toFixed(0)}`}
          icon={DollarSign}
          tone="success"
          delta={revenueDelta}
        />
        <Stat label="Orders" value={inRange.length.toString()} icon={ShoppingCart} tone="accent" />
        <Stat label="Units sold" value={unitsSold.toString()} icon={Package} tone="default" />
        <Stat
          label="Avg order value"
          value={`NRS ${avgOrder.toFixed(0)}`}
          icon={TrendingUp}
          tone="default"
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="shadow-sm lg:col-span-2">
          <CardHeader className="pb-2 flex-row items-start justify-between space-y-0">
            <div>
              <CardTitle className="text-sm font-medium">Revenue trend</CardTitle>
              <CardDescription className="text-xs">Last {rangeDays} days · NRS</CardDescription>
            </div>
            <Badge variant="outline" className="font-normal">
              {pending} pending
            </Badge>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={days}>
                  <defs>
                    <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" fontSize={11} tickLine={false} />
                  <YAxis fontSize={11} tickLine={false} width={48} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(v: number, k: string) =>
                      k === "revenue" ? [`NRS ${v}`, "Revenue"] : [v, "Orders"]
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="var(--accent)"
                    strokeWidth={2}
                    fill="url(#revFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Orders by status</CardTitle>
            <CardDescription className="text-xs">Click a slice to filter</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              {statusCounts.length === 0 ? (
                <div className="h-full grid place-items-center text-sm text-muted-foreground">
                  No orders in range
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusCounts}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={48}
                      outerRadius={78}
                      paddingAngle={2}
                      onClick={(d: { name: string }) =>
                        setStatusFilter(statusFilter === d.name ? null : d.name)
                      }
                      className="cursor-pointer"
                    >
                      {statusCounts.map((s) => (
                        <Cell
                          key={s.name}
                          fill={s.fill}
                          stroke="var(--background)"
                          strokeWidth={2}
                          opacity={statusFilter && statusFilter !== s.name ? 0.35 : 1}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: "var(--card)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      formatter={(v: number, n: string) => [v, n]}
                    />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Top products by revenue</CardTitle>
          <CardDescription className="text-xs">Click a bar to filter orders below</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            {topProducts.length === 0 ? (
              <div className="h-full grid place-items-center text-sm text-muted-foreground">
                No sales in range
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topProducts} layout="vertical" margin={{ left: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis type="number" fontSize={11} tickLine={false} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    fontSize={11}
                    tickLine={false}
                    width={140}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(v: number, k: string) =>
                      k === "revenue" ? [`NRS ${v}`, "Revenue"] : [v, "Units"]
                    }
                  />
                  <Bar
                    dataKey="revenue"
                    radius={4}
                    className="cursor-pointer"
                    onClick={(d: { name: string }) =>
                      setProductFilter(productFilter === d.name ? null : d.name)
                    }
                  >
                    {topProducts.map((p) => (
                      <Cell
                        key={p.name}
                        fill="var(--accent)"
                        opacity={productFilter && productFilter !== p.name ? 0.35 : 1}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">
              Recent orders{" "}
              {hasFilter && (
                <span className="text-xs text-muted-foreground font-normal">· filtered</span>
              )}
            </CardTitle>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {statusFilter && (
                <Badge variant="secondary" className="capitalize gap-1">
                  status: {statusFilter}
                  <button
                    onClick={() => setStatusFilter(null)}
                    className="opacity-70 hover:opacity-100"
                  >
                    ×
                  </button>
                </Badge>
              )}
              {productFilter && (
                <Badge variant="secondary" className="gap-1 max-w-[200px]">
                  <span className="truncate">product: {productFilter}</span>
                  <button
                    onClick={() => setProductFilter(null)}
                    className="opacity-70 hover:opacity-100"
                  >
                    ×
                  </button>
                </Badge>
              )}
            </div>
          </div>
          {hasFilter && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y border-t">
            {drillOrders.map((o) => (
              <div
                key={o.id}
                className="p-3 flex items-center gap-3 text-sm hover:bg-muted/30 transition"
              >
                <div
                  className="size-2 rounded-full shrink-0"
                  style={{ background: STATUS_COLORS[o.status] ?? "#94a3b8" }}
                />
                <div className="flex-1 min-w-0">
                  <div className="truncate font-medium">
                    {o.product_name}{" "}
                    <span className="text-xs text-muted-foreground">× {o.quantity}</span>
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {o.customer_name} · {new Date(o.created_at).toLocaleString()}
                  </div>
                </div>
                <Badge variant="outline" className="capitalize text-[10px]">
                  {o.status.replace(/_/g, " ")}
                </Badge>
                <div className="tabular-nums font-medium w-24 text-right">NRS {o.total}</div>
              </div>
            ))}
            {drillOrders.length === 0 && (
              <div className="p-10 text-center text-sm text-muted-foreground">
                No orders match the current filter.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
