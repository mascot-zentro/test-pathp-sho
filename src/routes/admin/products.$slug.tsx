import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ImageUpload } from "@/components/image-upload";
import { ExternalLink, Trash2 } from "lucide-react";
import {
  type Category,
  type Product,
  type ProductColor,
  type ProductImage,
  type ProductSize,
  STANDARD_SIZES,
} from "@/lib/admin-types";
import { slugify } from "@/lib/slugify";

export const Route = createFileRoute("/admin/products/$slug")({
  ssr: false,
  component: ProductEditPage,
});

function ProductEditPage() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [product, setProduct] = useState<Product | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [colors, setColors] = useState<ProductColor[]>([]);
  const [sizes, setSizes] = useState<ProductSize[]>([]);
  const [gallery, setGallery] = useState<ProductImage[]>([]);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [onSale, setOnSale] = useState(false);
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadProduct = () => {
    supabase
      .from("products")
      .select("*")
      .then(({ data }) => {
        const match = ((data as Product[]) ?? []).find((p) => slugify(p.name) === slug) ?? null;
        setProduct(match);
        setImageUrl(match?.image_url ?? null);
        setOnSale(match?.on_sale ?? false);
        setActive(match?.active ?? true);
        setLoading(false);
      });
  };
  useEffect(() => {
    loadProduct();
  }, [slug]);

  useEffect(() => {
    supabase
      .from("categories")
      .select("*")
      .order("position")
      .then(({ data }) => setCategories((data as Category[]) ?? []));
  }, []);

  const loadGallery = (productId: string) =>
    supabase
      .from("product_images")
      .select("*")
      .eq("product_id", productId)
      .order("position")
      .then(({ data }) => setGallery((data as ProductImage[]) ?? []));
  const loadSizes = (productId: string) =>
    supabase
      .from("product_sizes")
      .select("*")
      .eq("product_id", productId)
      .order("position")
      .then(({ data }) => setSizes((data as ProductSize[]) ?? []));
  const loadColors = (productId: string) =>
    supabase
      .from("product_colors")
      .select("*")
      .eq("product_id", productId)
      .then(({ data }) => setColors((data as ProductColor[]) ?? []));

  useEffect(() => {
    if (!product) return;
    loadColors(product.id);
    loadSizes(product.id);
    loadGallery(product.id);
  }, [product?.id]);

  const save = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!product) return;
    const f = new FormData(e.currentTarget);
    const payload = {
      name: String(f.get("name")),
      description: String(f.get("description") || ""),
      price: Number(f.get("price")),
      sale_price: f.get("sale_price") ? Number(f.get("sale_price")) : null,
      cost_price: f.get("cost_price") ? Number(f.get("cost_price")) : null,
      on_sale: onSale,
      image_url: imageUrl,
      whatsapp_number: String(f.get("whatsapp_number") || "") || null,
      weight: Number(f.get("weight") || 0.5),
      active,
      stock_quantity: f.get("stock_quantity") ? Number(f.get("stock_quantity")) : null,
      low_stock_threshold: f.get("low_stock_threshold") ? Number(f.get("low_stock_threshold")) : 5,
      category: String(f.get("category") || "") || null,
    };
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
    setSaving(true);
    const { error } = await supabase.from("products").update(payload).eq("id", product.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Saved");
    const newSlug = slugify(payload.name);
    if (newSlug !== slug) {
      navigate({ to: "/admin/products/$slug", params: { slug: newSlug } });
    } else {
      loadProduct();
    }
  };

  const del = async () => {
    if (!product) return;
    if (!confirm(`Delete "${product.name}"? This cannot be undone.`)) return;
    const { error } = await supabase.from("products").delete().eq("id", product.id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    navigate({ to: "/admin/products" });
  };

  const addGalleryImage = async (url: string) => {
    if (!product) return;
    const { error } = await supabase
      .from("product_images")
      .insert({ product_id: product.id, image_url: url, position: gallery.length });
    if (error) return toast.error(error.message);
    loadGallery(product.id);
  };
  const removeGalleryImage = async (imgId: string) => {
    if (!product) return;
    await supabase.from("product_images").delete().eq("id", imgId);
    loadGallery(product.id);
  };
  const moveGalleryImage = async (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= gallery.length || !product) return;
    const a = gallery[index],
      b = gallery[target];
    await supabase.from("product_images").update({ position: b.position }).eq("id", a.id);
    await supabase.from("product_images").update({ position: a.position }).eq("id", b.id);
    loadGallery(product.id);
  };

  const addColor = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!product) return;
    const f = new FormData(e.currentTarget);
    const stock = f.get("stock");
    const { error } = await supabase.from("product_colors").insert({
      product_id: product.id,
      name: String(f.get("cname")),
      hex: String(f.get("hex")),
      stock_quantity: stock ? Number(stock) : null,
    });
    if (error) return toast.error(error.message);
    (e.currentTarget as HTMLFormElement).reset();
    loadColors(product.id);
  };
  const setColorStockLocal = (id: string, value: string) => {
    setColors((cs) =>
      cs.map((c) =>
        c.id === id ? { ...c, stock_quantity: value === "" ? null : Number(value) } : c,
      ),
    );
  };
  const saveColorStock = async (id: string, value: string) => {
    await supabase
      .from("product_colors")
      .update({ stock_quantity: value === "" ? null : Number(value) })
      .eq("id", id);
  };
  const delColor = async (id: string) => {
    await supabase.from("product_colors").delete().eq("id", id);
    if (product) loadColors(product.id);
  };

  const addSize = async (name: string, stock: string) => {
    if (!product) return;
    if (sizes.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
      toast.error("That size already exists");
      return;
    }
    const { error } = await supabase.from("product_sizes").insert({
      product_id: product.id,
      name,
      position: sizes.length,
      stock_quantity: stock ? Number(stock) : null,
    });
    if (error) return toast.error(error.message);
    loadSizes(product.id);
  };
  const addSizeForm = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const name = String(f.get("sname") || "").trim();
    if (!name) return;
    await addSize(name, String(f.get("sstock") || ""));
    (e.currentTarget as HTMLFormElement).reset();
  };
  const setSizeStockLocal = (id: string, value: string) => {
    setSizes((ss) =>
      ss.map((s) =>
        s.id === id ? { ...s, stock_quantity: value === "" ? null : Number(value) } : s,
      ),
    );
  };
  const saveSizeStock = async (id: string, value: string) => {
    await supabase
      .from("product_sizes")
      .update({ stock_quantity: value === "" ? null : Number(value) })
      .eq("id", id);
  };
  const delSize = async (id: string) => {
    await supabase.from("product_sizes").delete().eq("id", id);
    if (product) loadSizes(product.id);
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (!product) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground mb-4">No product found at this address.</p>
        <Button variant="outline" asChild>
          <Link to="/admin/products">Back to products</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/admin/products">Products</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="truncate max-w-[240px]">{product.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display tracking-tight">{product.name}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            NRS {product.price}
            {product.on_sale && product.sale_price ? ` → ${product.sale_price}` : ""}
            {product.category && <> · {product.category}</>}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" asChild>
            <a href={`/product/${product.id}`} target="_blank" rel="noreferrer">
              <ExternalLink className="size-4" /> View on store
            </a>
          </Button>
          <Button variant="destructive" size="sm" onClick={del}>
            <Trash2 className="size-4" /> Delete
          </Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6 items-start">
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="font-display text-xl">Details</CardTitle>
            <CardDescription>Core product information shown in the shop.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={save} className="space-y-3">
              <div>
                <Label>Name</Label>
                <Input name="name" required defaultValue={product.name} />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea name="description" defaultValue={product.description ?? ""} />
              </div>
              <div>
                <Label>Category</Label>
                <Input
                  name="category"
                  list="category-options"
                  defaultValue={product.category ?? ""}
                  placeholder="e.g. Men, Women, Kids"
                />
                <datalist id="category-options">
                  {categories.map((c) => (
                    <option key={c.id} value={c.name} />
                  ))}
                </datalist>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div>
                  <Label>Cost price (NRS)</Label>
                  <Input
                    name="cost_price"
                    type="number"
                    step="0.01"
                    min="0"
                    defaultValue={product.cost_price ?? ""}
                    placeholder="What you paid"
                  />
                </div>
                <div>
                  <Label>Price (NRS)</Label>
                  <Input
                    name="price"
                    type="number"
                    step="0.01"
                    required
                    defaultValue={product.price}
                  />
                </div>
                <div>
                  <Label>Sale price</Label>
                  <Input
                    name="sale_price"
                    type="number"
                    step="0.01"
                    defaultValue={product.sale_price ?? ""}
                  />
                </div>
                <div>
                  <Label>Weight (kg)</Label>
                  <Input
                    name="weight"
                    type="number"
                    step="0.1"
                    min="0.5"
                    max="10"
                    defaultValue={product.weight ?? 0.5}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Stock quantity</Label>
                  <Input
                    name="stock_quantity"
                    type="number"
                    min="0"
                    step="1"
                    defaultValue={product.stock_quantity ?? ""}
                    placeholder="Leave blank for unlimited / untracked"
                  />
                </div>
                <div>
                  <Label>Low stock alert at</Label>
                  <Input
                    name="low_stock_threshold"
                    type="number"
                    min="0"
                    step="1"
                    defaultValue={product.low_stock_threshold ?? 5}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground -mt-2">
                If this product has colors or sizes, each variant's own stock is used instead of
                stock quantity above — but they all share this alert threshold.
              </p>
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
                <Input
                  name="whatsapp_number"
                  defaultValue={product.whatsapp_number ?? ""}
                  placeholder="9779841234567"
                />
              </div>
              <Button disabled={saving} className="w-full">
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="font-display text-lg">Gallery images</CardTitle>
              <CardDescription>
                Extra photos shown on this product's page, alongside the cover image.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-3 mb-3">
                {gallery.map((img, i) => (
                  <div
                    key={img.id}
                    className="relative size-20 rounded-md border overflow-hidden group"
                  >
                    <img src={img.image_url} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-1.5">
                      {i > 0 && (
                        <button
                          type="button"
                          onClick={() => moveGalleryImage(i, -1)}
                          className="text-white text-sm leading-none"
                        >
                          ‹
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => removeGalleryImage(img.id)}
                        className="text-white"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                      {i < gallery.length - 1 && (
                        <button
                          type="button"
                          onClick={() => moveGalleryImage(i, 1)}
                          className="text-white text-sm leading-none"
                        >
                          ›
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {gallery.length === 0 && (
                  <span className="text-xs text-muted-foreground">No gallery images yet</span>
                )}
              </div>
              <ImageUpload
                bucket="product-images"
                value={null}
                onChange={(url) => url && addGalleryImage(url)}
                label="Add an image"
              />
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="font-display text-lg">Colors</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 mb-3">
                {colors.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center gap-2 border rounded-md px-3 py-2 text-sm"
                  >
                    <span
                      className="size-5 rounded-full border shrink-0"
                      style={{ background: c.hex }}
                    />
                    <span className="flex-1 truncate">{c.name}</span>
                    <Label className="text-xs text-muted-foreground">Stock</Label>
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      placeholder="∞"
                      value={c.stock_quantity ?? ""}
                      onChange={(e) => setColorStockLocal(c.id, e.target.value)}
                      onBlur={(e) => saveColorStock(c.id, e.target.value)}
                      className="w-20"
                    />
                    <button
                      type="button"
                      onClick={() => delColor(c.id)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ))}
                {colors.length === 0 && (
                  <span className="text-xs text-muted-foreground">No colors yet</span>
                )}
              </div>
              <form onSubmit={addColor} className="flex gap-2">
                <Input
                  name="cname"
                  placeholder="Color name (e.g. Sand)"
                  required
                  className="flex-1"
                />
                <Input name="hex" type="color" defaultValue="#d4a574" className="w-16" />
                <Input
                  name="stock"
                  type="number"
                  min="0"
                  step="1"
                  placeholder="Stock (∞)"
                  className="w-28"
                />
                <Button type="submit" variant="outline">
                  Add
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="font-display text-lg">Sizes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2 mb-3">
                {STANDARD_SIZES.filter(
                  (std) => !sizes.some((s) => s.name.toLowerCase() === std.toLowerCase()),
                ).map((std) => (
                  <button
                    key={std}
                    type="button"
                    onClick={() => addSize(std, "")}
                    className="text-xs border rounded-md px-2.5 py-1.5 hover:border-accent hover:text-accent transition"
                  >
                    + {std}
                  </button>
                ))}
              </div>
              <div className="space-y-2 mb-3">
                {sizes.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center gap-2 border rounded-md px-3 py-2 text-sm"
                  >
                    <span className="flex-1 font-medium">{s.name}</span>
                    <Label className="text-xs text-muted-foreground">Stock</Label>
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      placeholder="∞"
                      value={s.stock_quantity ?? ""}
                      onChange={(e) => setSizeStockLocal(s.id, e.target.value)}
                      onBlur={(e) => saveSizeStock(s.id, e.target.value)}
                      className="w-20"
                    />
                    <button
                      type="button"
                      onClick={() => delSize(s.id)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ))}
                {sizes.length === 0 && (
                  <span className="text-xs text-muted-foreground">
                    No sizes yet — use the quick-add buttons above, or add a custom one below
                  </span>
                )}
              </div>
              <form onSubmit={addSizeForm} className="flex gap-2">
                <Input
                  name="sname"
                  placeholder="Custom size (e.g. 32W)"
                  required
                  className="flex-1"
                />
                <Input
                  name="sstock"
                  type="number"
                  min="0"
                  step="1"
                  placeholder="Stock (∞)"
                  className="w-28"
                />
                <Button type="submit" variant="outline">
                  Add
                </Button>
              </form>
              <p className="text-xs text-muted-foreground mt-2">
                Sizes and colors are tracked as independent stock pools. If a product has colors,
                color stock governs checkout; otherwise size stock does.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
