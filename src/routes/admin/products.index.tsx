import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ImageUpload } from "@/components/image-upload";
import { Plus, Search, Trash2, ArrowUp, ArrowDown, ArrowUpDown, Package, AlertTriangle, PackageX, Wallet } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/page-header";
import { Stat } from "@/components/admin/stat-card";
import { type Category, type Product, type ProductColor, type ProductSize } from "@/lib/admin-types";
import { slugify } from "@/lib/slugify";

const DEFAULT_LOW_STOCK_THRESHOLD = 5;
type SortKey = "name" | "price" | "stock" | "margin" | "created";
type SortDir = "asc" | "desc";

export const Route = createFileRoute("/admin/products/")({
  ssr: false,
  component: ProductsPage,
});

function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [colors, setColors] = useState<ProductColor[]>([]);
  const [sizes, setSizes] = useState<ProductSize[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("created");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [open, setOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [onSale, setOnSale] = useState(false);
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = () =>
    supabase
      .from("products")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data }) => setProducts((data as Product[]) ?? []));
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    supabase
      .from("categories")
      .select("*")
      .order("position")
      .then(({ data }) => setCategories((data as Category[]) ?? []));
    Promise.all([
      supabase.from("product_colors").select("*"),
      supabase.from("product_sizes").select("*"),
    ]).then(([c, s]) => {
      setColors((c.data as ProductColor[]) ?? []);
      setSizes((s.data as ProductSize[]) ?? []);
    });
  }, []);

  const resetForm = () => {
    setImageUrl(null);
    setOnSale(false);
    setActive(true);
  };

  const create = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const name = String(f.get("name") || "").trim();
    if (!name) return toast.error("Name is required");
    const payload = {
      name,
      description: String(f.get("description") || ""),
      price: Number(f.get("price")),
      sale_price: f.get("sale_price") ? Number(f.get("sale_price")) : null,
      on_sale: onSale,
      image_url: imageUrl,
      whatsapp_number: String(f.get("whatsapp_number") || "") || null,
      weight: Number(f.get("weight") || 0.5),
      active,
      stock_quantity: f.get("stock_quantity") ? Number(f.get("stock_quantity")) : null,
      category: String(f.get("category") || "") || null,
    };
    setSaving(true);
    if (
      payload.category &&
      !categories.some((c) => c.name.toLowerCase() === payload.category!.toLowerCase())
    ) {
      const { error: catErr } = await supabase
        .from("categories")
        .insert({ name: payload.category, position: categories.length });
      if (!catErr)
        supabase
          .from("categories")
          .select("*")
          .order("position")
          .then(({ data }) => setCategories((data as Category[]) ?? []));
    }
    const { error } = await supabase.from("products").insert(payload);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Product added");
    setOpen(false);
    resetForm();
    (e.currentTarget as HTMLFormElement).reset();
    load();
  };

  const del = async (id: string) => {
    if (!confirm("Delete this product?")) return;
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Deleted");
      load();
    }
  };

  // Stock_quantity is only meaningful when a product has no color/size
  // variants — once variants exist, real availability lives on them
  // instead (see the inventory page and decrement_stock), so showing the
  // raw stock_quantity column here would be misleading for variant
  // products. Null variant stock means "untracked" for that variant; if
  // every relevant variant is untracked the product reads as unlimited,
  // otherwise untracked variants just don't add to the total (rather than
  // silently being treated as infinite within a finite sum).
  const enriched = useMemo(() => {
    return products.map((p) => {
      const pColors = colors.filter((c) => c.product_id === p.id);
      const pSizes = sizes.filter((s) => s.product_id === p.id);
      const variantStocks = [...pColors, ...pSizes].map((v) => v.stock_quantity);
      let effectiveStock: number | null;
      if (variantStocks.length === 0) {
        effectiveStock = p.stock_quantity;
      } else if (variantStocks.every((s) => s === null)) {
        effectiveStock = null;
      } else {
        effectiveStock = variantStocks.reduce((sum: number, s) => sum + (s ?? 0), 0);
      }
      const threshold = p.low_stock_threshold ?? DEFAULT_LOW_STOCK_THRESHOLD;
      const isOutOfStock = effectiveStock === 0;
      const isLowStock = effectiveStock !== null && effectiveStock > 0 && effectiveStock <= threshold;
      const effectivePrice = p.on_sale && p.sale_price ? p.sale_price : p.price;
      const margin = p.cost_price !== null ? effectivePrice - p.cost_price : null;
      const marginPct = margin !== null && effectivePrice > 0 ? (margin / effectivePrice) * 100 : null;
      return { product: p, colors: pColors, sizes: pSizes, effectiveStock, isOutOfStock, isLowStock, margin, marginPct };
    });
  }, [products, colors, sizes]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = enriched.filter((r) => {
      const p = r.product;
      if (categoryFilter !== "all" && p.category !== categoryFilter) return false;
      if (statusFilter === "active" && !p.active) return false;
      if (statusFilter === "hidden" && p.active) return false;
      if (statusFilter === "out_of_stock" && !r.isOutOfStock) return false;
      if (statusFilter === "low_stock" && !r.isLowStock) return false;
      if (q && !p.name.toLowerCase().includes(q)) return false;
      return true;
    });
    const dir = sortDir === "asc" ? 1 : -1;
    rows = [...rows].sort((a, b) => {
      switch (sortKey) {
        case "name":
          return a.product.name.localeCompare(b.product.name) * dir;
        case "price": {
          const ap = a.product.on_sale && a.product.sale_price ? a.product.sale_price : a.product.price;
          const bp = b.product.on_sale && b.product.sale_price ? b.product.sale_price : b.product.price;
          return (ap - bp) * dir;
        }
        case "stock": {
          const av = a.effectiveStock ?? Infinity;
          const bv = b.effectiveStock ?? Infinity;
          return (av - bv) * dir;
        }
        case "margin": {
          const av = a.marginPct ?? -Infinity;
          const bv = b.marginPct ?? -Infinity;
          return (av - bv) * dir;
        }
        case "created":
        default:
          return (new Date(a.product.created_at).getTime() - new Date(b.product.created_at).getTime()) * dir;
      }
    });
    return rows;
  }, [enriched, search, categoryFilter, statusFilter, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir(key === "created" ? "desc" : "asc"); }
  };
  const SortHeader = ({ label, k, className }: { label: string; k: SortKey; className?: string }) => (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => toggleSort(k)}
        className="inline-flex items-center gap-1 hover:text-foreground transition"
      >
        {label}
        {sortKey === k ? (
          sortDir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />
        ) : (
          <ArrowUpDown className="size-3 opacity-30" />
        )}
      </button>
    </TableHead>
  );

  // Catalog-wide, independent of the current filter/search, so the
  // summary stays a stable "how's the whole catalog doing" view.
  const lowStockCount = enriched.filter((r) => r.isLowStock).length;
  const outOfStockCount = enriched.filter((r) => r.isOutOfStock).length;
  const catalogValue = enriched.reduce((sum, r) => {
    const effectivePrice = r.product.on_sale && r.product.sale_price ? r.product.sale_price : r.product.price;
    return sum + effectivePrice * (r.effectiveStock ?? 0);
  }, 0);

  return (
    <div>
      <AdminPageHeader
        title="Products"
        description={`${products.length} ${products.length === 1 ? "product" : "products"} in your catalog`}
        actions={
          <Dialog
            open={open}
            onOpenChange={(v) => {
              setOpen(v);
              if (!v) resetForm();
            }}
          >
            <DialogTrigger asChild>
              <Button>
                <Plus className="size-4" /> Add product
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
              <DialogHeader>
                <DialogTitle className="font-display text-xl">Add product</DialogTitle>
                <DialogDescription>
                  Create a new listing for your store. Colors, sizes and gallery images can be added
                  after saving.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={create} className="space-y-3">
                <div>
                  <Label>Name</Label>
                  <Input name="name" required />
                </div>
                <div>
                  <Label>Description</Label>
                  <Textarea name="description" />
                </div>
                <div>
                  <Label>Category</Label>
                  <Input
                    name="category"
                    list="category-options"
                    placeholder="e.g. Men, Women, Kids"
                  />
                  <datalist id="category-options">
                    {categories.map((c) => (
                      <option key={c.id} value={c.name} />
                    ))}
                  </datalist>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label>Price (NRS)</Label>
                    <Input name="price" type="number" step="0.01" required />
                  </div>
                  <div>
                    <Label>Sale price</Label>
                    <Input name="sale_price" type="number" step="0.01" />
                  </div>
                  <div>
                    <Label>Weight (kg)</Label>
                    <Input
                      name="weight"
                      type="number"
                      step="0.1"
                      min="0.5"
                      max="10"
                      defaultValue={0.5}
                    />
                  </div>
                </div>
                <div>
                  <Label>Stock quantity</Label>
                  <Input
                    name="stock_quantity"
                    type="number"
                    min="0"
                    step="1"
                    placeholder="Leave blank for unlimited / untracked"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={onSale} onCheckedChange={setOnSale} id="on_sale" />
                  <Label htmlFor="on_sale">Mark as on sale</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={active} onCheckedChange={setActive} id="active" />
                  <Label htmlFor="active">Active (visible in shop)</Label>
                </div>
                <ImageUpload
                  bucket="product-images"
                  value={imageUrl}
                  onChange={setImageUrl}
                  label="Product image"
                />
                <div>
                  <Label>WhatsApp number (override)</Label>
                  <Input name="whatsapp_number" placeholder="9779841234567" />
                </div>
                <Button disabled={saving} className="w-full">
                  {saving ? "Adding…" : "Add product"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Stat label="Total products" value={String(products.length)} icon={Package} />
        <Stat
          label="Low stock"
          value={String(lowStockCount)}
          icon={AlertTriangle}
          tone={lowStockCount > 0 ? "warn" : "default"}
        />
        <Stat
          label="Out of stock"
          value={String(outOfStockCount)}
          icon={PackageX}
          tone={outOfStockCount > 0 ? "warn" : "default"}
        />
        <Stat label="Catalog value" value={`NRS ${catalogValue.toLocaleString()}`} icon={Wallet} tone="accent" />
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products…"
            className="pl-8"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="text-sm border rounded-md px-2 py-2 bg-background hover:border-accent cursor-pointer"
        >
          <option value="all">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="text-sm border rounded-md px-2 py-2 bg-background hover:border-accent cursor-pointer"
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="hidden">Hidden</option>
          <option value="low_stock">Low stock</option>
          <option value="out_of_stock">Out of stock</option>
        </select>
      </div>

      <Card className="shadow-sm">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16"></TableHead>
                <SortHeader label="Name" k="name" />
                <TableHead>Category</TableHead>
                <TableHead>Variants</TableHead>
                <SortHeader label="Price" k="price" />
                <SortHeader label="Cost / Margin" k="margin" />
                <SortHeader label="Stock" k="stock" />
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => {
                const p = r.product;
                const daysAgo = Math.floor((Date.now() - new Date(p.created_at).getTime()) / 86_400_000);
                const addedLabel = daysAgo <= 0 ? "today" : daysAgo === 1 ? "1 day ago" : daysAgo < 30 ? `${daysAgo} days ago` : new Date(p.created_at).toLocaleDateString();
                return (
                <TableRow key={p.id} className="hover:bg-muted/30">
                  <TableCell>
                    <div className="size-12 bg-muted rounded-md overflow-hidden border">
                      {p.image_url && (
                        <img src={p.image_url} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="font-medium max-w-[220px]">
                    <div className="truncate">{p.name}</div>
                    <div className="text-[11px] text-muted-foreground font-normal">Added {addedLabel}</div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{p.category ?? "—"}</TableCell>
                  <TableCell>
                    {r.colors.length === 0 && r.sizes.length === 0 ? (
                      <span className="text-muted-foreground text-xs">—</span>
                    ) : (
                      <div className="flex items-center gap-2">
                        {r.colors.length > 0 && (
                          <div className="flex items-center -space-x-1" title={r.colors.map((c) => c.name).join(", ")}>
                            {r.colors.slice(0, 4).map((c) => (
                              <span
                                key={c.id}
                                className="size-4 rounded-full border-2 border-card shrink-0"
                                style={{ background: c.hex }}
                              />
                            ))}
                            {r.colors.length > 4 && (
                              <span className="text-[10px] text-muted-foreground pl-1.5">+{r.colors.length - 4}</span>
                            )}
                          </div>
                        )}
                        {r.sizes.length > 0 && (
                          <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                            {r.sizes.length} size{r.sizes.length === 1 ? "" : "s"}
                          </span>
                        )}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="tabular-nums whitespace-nowrap">
                    NRS {p.price}
                    {p.on_sale && p.sale_price ? ` → ${p.sale_price}` : ""}
                  </TableCell>
                  <TableCell className="tabular-nums whitespace-nowrap text-sm">
                    {p.cost_price === null ? (
                      <span className="text-muted-foreground text-xs">No cost set</span>
                    ) : (
                      <>
                        <span className="text-muted-foreground">NRS {p.cost_price}</span>
                        {r.marginPct !== null && (
                          <span className={`ml-1.5 ${r.margin !== null && r.margin < 0 ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                            ({r.marginPct.toFixed(0)}%)
                          </span>
                        )}
                      </>
                    )}
                  </TableCell>
                  <TableCell>
                    {r.effectiveStock === null ? (
                      <span className="text-muted-foreground">∞</span>
                    ) : r.isOutOfStock ? (
                      <span className="text-destructive font-medium">0</span>
                    ) : r.isLowStock ? (
                      <span className="text-amber-600 font-medium">{r.effectiveStock}</span>
                    ) : (
                      <span className="text-muted-foreground">{r.effectiveStock}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {!p.active && (
                        <Badge variant="secondary" className="text-[10px] py-0">
                          hidden
                        </Badge>
                      )}
                      {p.on_sale && (
                        <Badge className="text-[10px] py-0 bg-accent text-accent-foreground border-transparent">
                          sale
                        </Badge>
                      )}
                      {r.isOutOfStock && (
                        <Badge variant="destructive" className="text-[10px] py-0">
                          out of stock
                        </Badge>
                      )}
                      {r.isLowStock && (
                        <Badge variant="outline" className="text-[10px] py-0 border-amber-400 text-amber-700">
                          low stock
                        </Badge>
                      )}
                      {p.active && !p.on_sale && !r.isOutOfStock && !r.isLowStock && (
                        <Badge variant="outline" className="text-[10px] py-0">
                          live
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1.5">
                      <Button size="sm" variant="outline" asChild>
                        <Link to="/admin/products/$slug" params={{ slug: slugify(p.name) }}>
                          Edit
                        </Link>
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => del(p.id)}>
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {filtered.length === 0 && (
            <div className="p-10 text-center text-sm text-muted-foreground">
              {products.length === 0
                ? "No products yet. Add your first one above →"
                : "No products match your filters."}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
