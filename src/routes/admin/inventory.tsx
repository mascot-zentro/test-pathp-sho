import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AdminPageHeader } from "@/components/admin/page-header";
import { Stat } from "@/components/admin/stat-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Boxes, AlertTriangle, PackageX, Wallet, TrendingUp, Trash2, BellRing, Check } from "lucide-react";
import {
  type Product,
  type ProductColor,
  type ProductSize,
  type Expense,
  type StockAlert,
  EXPENSE_CATEGORIES,
} from "@/lib/admin-types";

export const Route = createFileRoute("/admin/inventory")({
  ssr: false,
  component: InventoryPage,
});

type StockRow = {
  key: string;
  productName: string;
  variant: string | null;
  axis: "color" | "size" | null;
  stock: number | null;
  threshold: number;
  price: number;
  costPrice: number | null;
  imageUrl: string | null;
  active: boolean;
};

const DEFAULT_LOW_STOCK_THRESHOLD = 5;

function InventoryPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [colors, setColors] = useState<ProductColor[]>([]);
  const [sizes, setSizes] = useState<ProductSize[]>([]);
  const [loadingStock, setLoadingStock] = useState(true);
  const [stockFilter, setStockFilter] = useState<"attention" | "all">("attention");

  const [alerts, setAlerts] = useState<StockAlert[]>([]);
  const [loadingAlerts, setLoadingAlerts] = useState(true);

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loadingExpenses, setLoadingExpenses] = useState(true);
  const [editing, setEditing] = useState<Expense | null>(null);

  const loadAlerts = () =>
    supabase
      .from("stock_alerts")
      .select("*")
      .eq("acknowledged", false)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) toast.error(`Couldn't load stock alerts: ${error.message}`);
        setAlerts((data as StockAlert[]) ?? []);
        setLoadingAlerts(false);
      });
  useEffect(() => {
    loadAlerts();
  }, []);

  const acknowledgeAlert = async (id: string) => {
    const { error } = await supabase
      .from("stock_alerts")
      .update({ acknowledged: true })
      .eq("id", id);
    if (error) return toast.error(error.message);
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  };

  const acknowledgeAllAlerts = async () => {
    const { error } = await supabase
      .from("stock_alerts")
      .update({ acknowledged: true })
      .eq("acknowledged", false);
    if (error) return toast.error(error.message);
    setAlerts([]);
    toast.success("All alerts cleared");
  };

  useEffect(() => {
    Promise.all([
      supabase.from("products").select("*"),
      supabase.from("product_colors").select("*"),
      supabase.from("product_sizes").select("*"),
    ]).then(([p, c, s]) => {
      if (p.error) toast.error(`Couldn't load products: ${p.error.message}`);
      setProducts((p.data as Product[]) ?? []);
      setColors((c.data as ProductColor[]) ?? []);
      setSizes((s.data as ProductSize[]) ?? []);
      setLoadingStock(false);
    });
  }, []);

  const loadExpenses = () =>
    supabase
      .from("expenses")
      .select("*")
      .order("expense_date", { ascending: false })
      .then(({ data, error }) => {
        if (error) toast.error(`Couldn't load expenses: ${error.message}`);
        setExpenses((data as Expense[]) ?? []);
        setLoadingExpenses(false);
      });
  useEffect(() => {
    loadExpenses();
  }, []);

  // Colors and sizes are independent stock pools (a product can track
  // both at once — see the decrement_stock fix), so each variant gets its
  // own row rather than trying to collapse them into one number.
  const stockRows = useMemo<StockRow[]>(() => {
    const rows: StockRow[] = [];
    for (const p of products) {
      const effectivePrice = p.on_sale && p.sale_price ? p.sale_price : p.price;
      const costPrice = p.cost_price ?? null;
      const threshold = p.low_stock_threshold ?? DEFAULT_LOW_STOCK_THRESHOLD;
      const pColors = colors.filter((c) => c.product_id === p.id);
      const pSizes = sizes.filter((s) => s.product_id === p.id);
      if (pColors.length === 0 && pSizes.length === 0) {
        rows.push({
          key: p.id,
          productName: p.name,
          variant: null,
          axis: null,
          stock: p.stock_quantity,
          threshold,
          price: effectivePrice,
          costPrice,
          imageUrl: p.image_url,
          active: p.active,
        });
        continue;
      }
      for (const c of pColors) {
        rows.push({
          key: c.id,
          productName: p.name,
          variant: c.name,
          axis: "color",
          stock: c.stock_quantity,
          threshold,
          price: effectivePrice,
          costPrice,
          imageUrl: p.image_url,
          active: p.active,
        });
      }
      for (const s of pSizes) {
        rows.push({
          key: s.id,
          productName: p.name,
          variant: s.name,
          axis: "size",
          stock: s.stock_quantity,
          threshold,
          price: effectivePrice,
          costPrice,
          imageUrl: p.image_url,
          active: p.active,
        });
      }
    }
    return rows.sort((a, b) => (a.stock ?? Infinity) - (b.stock ?? Infinity));
  }, [products, colors, sizes]);

  const outOfStock = stockRows.filter((r) => r.stock === 0);
  const lowStock = stockRows.filter(
    (r) => r.stock !== null && r.stock > 0 && r.stock <= r.threshold,
  );
  const trackedCount = stockRows.filter((r) => r.stock !== null).length;
  const inventoryValue = stockRows.reduce((sum, r) => sum + r.price * (r.stock ?? 0), 0);
  // Only counts rows where a cost price has been set — rows without one
  // are excluded rather than treated as 0 cost, so missing cost data
  // understates potential profit instead of silently overstating it.
  const potentialProfit = stockRows.reduce(
    (sum, r) => sum + (r.costPrice !== null ? (r.price - r.costPrice) * (r.stock ?? 0) : 0),
    0,
  );
  const rowsMissingCost = stockRows.filter((r) => r.costPrice === null).length;

  const visibleStockRows =
    stockFilter === "attention"
      ? stockRows.filter((r) => r.stock !== null && r.stock <= r.threshold)
      : stockRows;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const totalThisMonth = expenses
    .filter((e) => new Date(e.expense_date) >= monthStart)
    .reduce((sum, e) => sum + Number(e.amount), 0);
  const totalAllTime = expenses.reduce((sum, e) => sum + Number(e.amount), 0);

  const saveExpense = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const payload = {
      description: String(f.get("description") || "").trim(),
      category: String(f.get("category") || "").trim() || null,
      amount: Number(f.get("amount")),
      expense_date: String(f.get("expense_date") || new Date().toISOString().slice(0, 10)),
    };
    if (!payload.description) return toast.error("Description is required");
    if (!isFinite(payload.amount) || payload.amount < 0) return toast.error("Enter a valid amount");
    if (editing) {
      const { error } = await supabase.from("expenses").update(payload).eq("id", editing.id);
      if (error) return toast.error(error.message);
      toast.success("Expense updated");
      setEditing(null);
    } else {
      const { error } = await supabase.from("expenses").insert(payload);
      if (error) return toast.error(error.message);
      toast.success("Expense added");
      (e.currentTarget as HTMLFormElement).reset();
    }
    loadExpenses();
  };

  const delExpense = async (id: string) => {
    if (!confirm("Delete this expense?")) return;
    const { error } = await supabase.from("expenses").delete().eq("id", id);
    if (error) return toast.error(error.message);
    if (editing?.id === id) setEditing(null);
    loadExpenses();
  };

  return (
    <div className="space-y-10">
      <div>
        <AdminPageHeader
          title="Inventory & expenses"
          description="Stock levels across every product variant, and what it's costing to run the shop."
        />
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <Stat label="Tracked variants" value={String(trackedCount)} icon={Boxes} />
          <Stat
            label="Low stock"
            value={String(lowStock.length)}
            icon={AlertTriangle}
            tone={lowStock.length > 0 ? "warn" : "default"}
          />
          <Stat
            label="Out of stock"
            value={String(outOfStock.length)}
            icon={PackageX}
            tone={outOfStock.length > 0 ? "warn" : "default"}
          />
          <Stat
            label="Inventory value"
            value={`NRS ${inventoryValue.toLocaleString()}`}
            icon={Wallet}
            tone="accent"
          />
          <Stat
            label="Potential profit"
            value={`NRS ${potentialProfit.toLocaleString()}`}
            icon={TrendingUp}
            tone="accent"
          />
        </div>
        {rowsMissingCost > 0 && (
          <p className="text-xs text-muted-foreground -mt-4 mb-6">
            {rowsMissingCost} variant{rowsMissingCost === 1 ? "" : "s"} missing a cost price —
            potential profit is calculated only from variants that have one.
          </p>
        )}

        {!loadingAlerts && alerts.length > 0 && (
          <Card className="shadow-sm mb-6 border-amber-300/60 bg-amber-50/40 dark:bg-amber-950/10">
            <CardHeader className="pb-3 flex flex-row items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <BellRing className="size-4 text-amber-600" />
                <CardTitle className="font-display text-lg">
                  Stock alerts
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    {alerts.length} unacknowledged
                  </span>
                </CardTitle>
              </div>
              <Button size="sm" variant="outline" onClick={acknowledgeAllAlerts}>
                <Check className="size-3.5" /> Acknowledge all
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y border-t">
                {alerts.map((a) => (
                  <div
                    key={a.id}
                    className="p-3 flex items-center gap-3 text-sm hover:bg-muted/30 transition"
                  >
                    <Badge
                      variant={a.severity === "out" ? "destructive" : "secondary"}
                      className="text-[10px]"
                    >
                      {a.severity === "out" ? "out of stock" : "low stock"}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">
                        {a.product_name}
                        {a.variant_name && (
                          <span className="text-muted-foreground"> · {a.variant_name}</span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {a.stock_at_alert} left (threshold {a.threshold}) ·{" "}
                        {new Date(a.created_at).toLocaleString()}
                      </div>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => acknowledgeAlert(a.id)}>
                      Acknowledge
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="shadow-sm">
          <CardHeader className="pb-3 flex flex-row items-start justify-between gap-3">
            <div>
              <CardTitle className="font-display text-lg">Stock levels</CardTitle>
              <CardDescription>
                Untracked variants (∞) aren't counted above — there's nothing to run out of.
              </CardDescription>
            </div>
            <div className="inline-flex rounded-md border bg-card p-0.5 text-xs shrink-0">
              {(["attention", "all"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setStockFilter(f)}
                  className={`px-3 py-1.5 rounded transition ${stockFilter === f ? "bg-accent text-accent-foreground" : "hover:bg-muted"}`}
                >
                  {f === "attention" ? "Needs attention" : "All variants"}
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loadingStock ? (
              <p className="p-6 text-sm text-muted-foreground">Loading…</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16"></TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Variant</TableHead>
                    <TableHead className="text-right">Stock</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                    <TableHead className="text-right">Sell price</TableHead>
                    <TableHead className="text-right">Margin</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleStockRows.map((r) => (
                    <TableRow key={r.key}>
                      <TableCell>
                        <div className="size-10 bg-muted rounded-md overflow-hidden border">
                          {r.imageUrl && (
                            <img src={r.imageUrl} alt="" className="w-full h-full object-cover" />
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-medium max-w-[200px] truncate">
                        {r.productName}
                        {!r.active && (
                          <Badge variant="secondary" className="text-[10px] py-0 ml-1.5">
                            hidden
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {r.variant ? `${r.axis === "color" ? "Color" : "Size"}: ${r.variant}` : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.stock === null ? (
                          <span className="text-muted-foreground">∞</span>
                        ) : r.stock === 0 ? (
                          <Badge variant="destructive" className="text-[10px]">
                            out of stock
                          </Badge>
                        ) : r.stock <= r.threshold ? (
                          <span className="text-amber-600 font-medium">{r.stock}</span>
                        ) : (
                          r.stock
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {r.costPrice === null ? "—" : `NRS ${r.costPrice.toLocaleString()}`}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        NRS {r.price.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.costPrice === null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          (() => {
                            const margin = r.price - r.costPrice;
                            const marginPct = r.price > 0 ? (margin / r.price) * 100 : 0;
                            return (
                              <span className={margin < 0 ? "text-destructive font-medium" : ""}>
                                NRS {margin.toLocaleString()}{" "}
                                <span className="text-muted-foreground text-xs">
                                  ({marginPct.toFixed(0)}%)
                                </span>
                              </span>
                            );
                          })()
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {r.stock === null ? "—" : `NRS ${(r.price * r.stock).toLocaleString()}`}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {!loadingStock && visibleStockRows.length === 0 && (
              <div className="p-10 text-center text-sm text-muted-foreground">
                {stockFilter === "attention"
                  ? "Nothing needs attention — everything's well stocked."
                  : "No products yet."}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div>
        <div className="mb-6">
          <h2 className="text-xl font-display tracking-tight">Expenses</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Track what it costs to run the shop — packaging, ads, rent, anything else.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-6 max-w-md">
          <Stat label="This month" value={`NRS ${totalThisMonth.toLocaleString()}`} />
          <Stat label="All time" value={`NRS ${totalAllTime.toLocaleString()}`} />
        </div>

        <div className="grid lg:grid-cols-[1fr,1.4fr] gap-6">
          <Card className="shadow-sm h-fit">
            <CardHeader className="pb-3">
              <CardTitle className="font-display text-xl">
                {editing ? "Edit expense" : "Add expense"}
              </CardTitle>
              <CardDescription>
                {editing ? "Update this entry." : "Log a new business expense."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={saveExpense} className="space-y-3" key={editing?.id ?? "new"}>
                <div>
                  <Label>Description</Label>
                  <Input
                    name="description"
                    required
                    defaultValue={editing?.description ?? ""}
                    placeholder="e.g. Courier pickup, Facebook ads"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label>Amount (NRS)</Label>
                    <Input
                      name="amount"
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      defaultValue={editing?.amount ?? ""}
                    />
                  </div>
                  <div>
                    <Label>Date</Label>
                    <Input
                      name="expense_date"
                      type="date"
                      required
                      defaultValue={editing?.expense_date ?? new Date().toISOString().slice(0, 10)}
                    />
                  </div>
                </div>
                <div>
                  <Label>Category</Label>
                  <Input
                    name="category"
                    list="expense-category-options"
                    defaultValue={editing?.category ?? ""}
                    placeholder="e.g. Packaging"
                  />
                  <datalist id="expense-category-options">
                    {EXPENSE_CATEGORIES.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>
                <div className="flex gap-2">
                  <Button>{editing ? "Save changes" : "Add expense"}</Button>
                  {editing && (
                    <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                      Cancel
                    </Button>
                  )}
                </div>
              </form>
            </CardContent>
          </Card>

          <Card className="shadow-sm h-fit">
            <CardHeader className="pb-3">
              <CardTitle className="font-display text-xl">All expenses</CardTitle>
              <CardDescription>
                {expenses.length} {expenses.length === 1 ? "entry" : "entries"}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {loadingExpenses ? (
                <p className="p-6 text-sm text-muted-foreground">Loading…</p>
              ) : (
                <div className="divide-y border-t">
                  {expenses.map((ex) => (
                    <div
                      key={ex.id}
                      className="p-3 flex items-center gap-3 hover:bg-muted/30 transition"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{ex.description}</div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(ex.expense_date).toLocaleDateString()}
                          {ex.category ? ` · ${ex.category}` : ""}
                        </div>
                      </div>
                      <div className="tabular-nums font-medium whitespace-nowrap">
                        NRS {Number(ex.amount).toLocaleString()}
                      </div>
                      <Button size="sm" variant="outline" onClick={() => setEditing(ex)}>
                        Edit
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => delExpense(ex.id)}>
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  ))}
                  {expenses.length === 0 && (
                    <div className="p-10 text-center text-sm text-muted-foreground">
                      No expenses logged yet.
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
