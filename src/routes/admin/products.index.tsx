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
import { Plus, Search, Trash2 } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/page-header";
import { type Category, type Product } from "@/lib/admin-types";
import { slugify } from "@/lib/slugify";

export const Route = createFileRoute("/admin/products/")({
  ssr: false,
  component: ProductsPage,
});

function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (categoryFilter !== "all" && p.category !== categoryFilter) return false;
      if (statusFilter === "active" && !p.active) return false;
      if (statusFilter === "hidden" && p.active) return false;
      if (statusFilter === "out_of_stock" && p.stock_quantity !== 0) return false;
      if (q && !p.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [products, search, categoryFilter, statusFilter]);

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
          <option value="out_of_stock">Out of stock</option>
        </select>
      </div>

      <Card className="shadow-sm">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16"></TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Stock</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p) => (
                <TableRow key={p.id} className="hover:bg-muted/30">
                  <TableCell>
                    <div className="size-12 bg-muted rounded-md overflow-hidden border">
                      {p.image_url && (
                        <img src={p.image_url} alt="" className="w-full h-full object-cover" />
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="font-medium max-w-[220px] truncate">{p.name}</TableCell>
                  <TableCell className="text-muted-foreground">{p.category ?? "—"}</TableCell>
                  <TableCell className="tabular-nums whitespace-nowrap">
                    NRS {p.price}
                    {p.on_sale && p.sale_price ? ` → ${p.sale_price}` : ""}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {p.stock_quantity === null ? "∞" : p.stock_quantity}
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
                      {p.stock_quantity === 0 && (
                        <Badge variant="destructive" className="text-[10px] py-0">
                          out of stock
                        </Badge>
                      )}
                      {p.active && !p.on_sale && p.stock_quantity !== 0 && (
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
              ))}
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
