import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AdminPageHeader } from "@/components/admin/page-header";
import { Stat } from "@/components/admin/stat-card";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DollarSign,
  ShoppingCart,
  Package,
  TrendingUp,
  Download,
  CheckCircle2,
} from "lucide-react";
import { type Order } from "@/lib/admin-types";

export const Route = createFileRoute("/admin/sales-report")({
  ssr: false,
  component: SalesReportPage,
});

type PresetKey = "today" | "7d" | "30d" | "this_month" | "last_month" | "custom";

const PRESETS: { key: PresetKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "this_month", label: "This month" },
  { key: "last_month", label: "Last month" },
  { key: "custom", label: "Custom" },
];

function presetRange(preset: PresetKey, customStart: string, customEnd: string) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let start: Date;
  let end: Date = new Date(startOfToday);
  end.setHours(23, 59, 59, 999);

  switch (preset) {
    case "today":
      start = startOfToday;
      break;
    case "7d":
      start = new Date(startOfToday);
      start.setDate(start.getDate() - 6);
      break;
    case "30d":
      start = new Date(startOfToday);
      start.setDate(start.getDate() - 29);
      break;
    case "this_month":
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case "last_month":
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      end = new Date(now.getFullYear(), now.getMonth(), 0);
      end.setHours(23, 59, 59, 999);
      break;
    case "custom":
      start = customStart ? new Date(customStart) : startOfToday;
      end = customEnd ? new Date(customEnd) : end;
      end.setHours(23, 59, 59, 999);
      break;
  }
  return { start, end };
}

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows
    .map((row) =>
      row
        .map((cell) => {
          const s = String(cell ?? "");
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(","),
    )
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function SalesReportPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [preset, setPreset] = useState<PresetKey>("30d");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [excludeCancelled, setExcludeCancelled] = useState(true);

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

  const { start, end } = useMemo(
    () => presetRange(preset, customStart, customEnd),
    [preset, customStart, customEnd],
  );

  const inRange = useMemo(
    () =>
      orders.filter((o) => {
        const d = new Date(o.created_at);
        return d >= start && d <= end && (!excludeCancelled || o.status !== "cancelled");
      }),
    [orders, start, end, excludeCancelled],
  );

  const revenue = inRange.reduce((s, o) => s + Number(o.total), 0);
  const units = inRange.reduce((s, o) => s + Number(o.quantity), 0);
  const aov = inRange.length ? revenue / inRange.length : 0;
  const delivered = inRange.filter((o) => o.status === "delivered").length;
  const deliveredRate = inRange.length ? (delivered / inRange.length) * 100 : 0;

  const byDay = useMemo(() => {
    const map = new Map<string, { orders: number; units: number; revenue: number }>();
    inRange.forEach((o) => {
      const key = new Date(o.created_at).toLocaleDateString("en-NP", { day: "numeric", month: "short", year: "numeric" });
      const cur = map.get(key) ?? { orders: 0, units: 0, revenue: 0 };
      cur.orders += 1;
      cur.units += Number(o.quantity);
      cur.revenue += Number(o.total);
      map.set(key, cur);
    });
    return [...map.entries()]
      .map(([date, v]) => ({ date, ...v }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [inRange]);

  const byProduct = useMemo(() => {
    const map = new Map<string, { units: number; revenue: number; orders: number }>();
    inRange.forEach((o) => {
      const cur = map.get(o.product_name) ?? { units: 0, revenue: 0, orders: 0 };
      cur.units += Number(o.quantity);
      cur.revenue += Number(o.total);
      cur.orders += 1;
      map.set(o.product_name, cur);
    });
    return [...map.entries()]
      .map(([name, v]) => ({ name, ...v, share: revenue ? (v.revenue / revenue) * 100 : 0 }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [inRange, revenue]);

  const byStatus = useMemo(() => {
    const map = new Map<string, { count: number; revenue: number }>();
    inRange.forEach((o) => {
      const cur = map.get(o.status) ?? { count: 0, revenue: 0 };
      cur.count += 1;
      cur.revenue += Number(o.total);
      map.set(o.status, cur);
    });
    return [...map.entries()].map(([status, v]) => ({ status, ...v }));
  }, [inRange]);

  const exportOrders = () => {
    const rows: (string | number)[][] = [
      [
        "Date",
        "Product",
        "Color",
        "Size",
        "Qty",
        "Unit price",
        "Total",
        "Customer",
        "Phone",
        "Status",
      ],
      ...inRange.map((o) => [
        new Date(o.created_at).toLocaleString(),
        o.product_name,
        o.color ?? "",
        o.size ?? "",
        o.quantity,
        // unit_price not in the Order type used elsewhere, fall back to total/quantity
        (Number(o.total) / Math.max(o.quantity, 1)).toFixed(2),
        o.total,
        o.customer_name,
        o.customer_phone,
        o.status,
      ]),
    ];
    downloadCsv(
      `sales-report_${start.toISOString().slice(0, 10)}_${end.toISOString().slice(0, 10)}.csv`,
      rows,
    );
  };

  const rangePicker = (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-md border bg-card p-0.5 text-xs">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            onClick={() => setPreset(p.key)}
            className={`px-3 py-1.5 rounded transition ${preset === p.key ? "bg-accent text-accent-foreground" : "hover:bg-muted"}`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <Button size="sm" variant="outline" onClick={exportOrders} disabled={inRange.length === 0}>
        <Download className="size-3.5" /> Export CSV
      </Button>
    </div>
  );

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Sales report"
        description="Detailed, exportable sales figures for a chosen date range — separate from the dashboard's quick-glance trends."
        actions={rangePicker}
      />

      {preset === "custom" && (
        <div className="flex flex-wrap items-end gap-3 -mt-2">
          <div>
            <Label className="text-xs">Start date</Label>
            <Input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs">End date</Label>
            <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
          </div>
        </div>
      )}

      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <input
          type="checkbox"
          checked={excludeCancelled}
          onChange={(e) => setExcludeCancelled(e.target.checked)}
          className="size-3.5"
        />
        Exclude cancelled orders
      </label>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Stat
              label="Revenue"
              value={`NRS ${revenue.toFixed(0)}`}
              icon={DollarSign}
              tone="success"
            />
            <Stat label="Orders" value={String(inRange.length)} icon={ShoppingCart} tone="accent" />
            <Stat label="Units sold" value={String(units)} icon={Package} />
            <Stat label="Avg order value" value={`NRS ${aov.toFixed(0)}`} icon={TrendingUp} />
            <Stat
              label="Delivered rate"
              value={`${deliveredRate.toFixed(0)}%`}
              icon={CheckCircle2}
            />
          </div>

          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Revenue by day</CardTitle>
              <CardDescription>{byDay.length} days with sales in range</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Orders</TableHead>
                    <TableHead className="text-right">Units</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byDay.map((d) => (
                    <TableRow key={d.date}>
                      <TableCell>{d.date}</TableCell>
                      <TableCell className="text-right tabular-nums">{d.orders}</TableCell>
                      <TableCell className="text-right tabular-nums">{d.units}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        NRS {d.revenue.toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                  {byDay.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="text-center text-sm text-muted-foreground py-8"
                      >
                        No sales in this range.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="grid lg:grid-cols-2 gap-6">
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">By product</CardTitle>
                <CardDescription>Sorted by revenue share</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Units</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-right">Share</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {byProduct.map((p) => (
                      <TableRow key={p.name}>
                        <TableCell className="max-w-[160px] truncate">{p.name}</TableCell>
                        <TableCell className="text-right tabular-nums">{p.units}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          NRS {p.revenue.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {p.share.toFixed(1)}%
                        </TableCell>
                      </TableRow>
                    ))}
                    {byProduct.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={4}
                          className="text-center text-sm text-muted-foreground py-8"
                        >
                          No sales in this range.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">By status</CardTitle>
                <CardDescription>Order outcomes in range</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Orders</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {byStatus.map((s) => (
                      <TableRow key={s.status}>
                        <TableCell className="capitalize">{s.status.replace(/_/g, " ")}</TableCell>
                        <TableCell className="text-right tabular-nums">{s.count}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          NRS {s.revenue.toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                    {byStatus.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={3}
                          className="text-center text-sm text-muted-foreground py-8"
                        >
                          No sales in this range.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
