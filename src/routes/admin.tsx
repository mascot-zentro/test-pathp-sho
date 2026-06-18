import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { claimAdmin } from "@/lib/admin.functions";
import { SiteNav } from "@/components/site-nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Trash2, RefreshCw, LayoutDashboard, Package, ShoppingCart, HelpCircle, FileText, Settings as SettingsIcon, DollarSign, TrendingUp, Clock, Truck, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ImageUpload } from "@/components/image-upload";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { syncOrderStatus, getPathaoStores } from "@/lib/pathao.functions";

export const Route = createFileRoute("/admin")({
  ssr: false,
  component: Admin,
});

type Product = { id: string; name: string; description: string | null; price: number; sale_price: number | null; on_sale: boolean; image_url: string | null; whatsapp_number: string | null; weight: number; active: boolean; stock_quantity: number | null; category: string | null };
type ProductColor = { id: string; product_id: string; name: string; hex: string; stock_quantity: number | null };
type ProductSize = { id: string; product_id: string; name: string; stock_quantity: number | null; position: number };
type ProductImage = { id: string; product_id: string; image_url: string; position: number };
type Category = { id: string; name: string; position: number };
type Order = { id: string; product_name: string; color: string | null; size: string | null; quantity: number; total: number; customer_name: string; customer_phone: string; customer_address: string; status: string; pathao_consignment_id: string | null; pathao_status: string | null; created_at: string };
type Faq = { id: string; question: string; answer: string; position: number; active: boolean };

const STANDARD_SIZES = ["S", "M", "L", "XL", "XXL"];

function Admin() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const claim = useServerFn(claimAdmin);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle()
      .then(({ data }) => setIsAdmin(!!data));
  }, [user]);

  const tryClaim = async () => {
    const res = await claim() as { granted: boolean; reason?: string };
    if (res.granted) { toast.success("You are now admin"); setIsAdmin(true); }
    else toast.error(res.reason || "Not granted");
  };

  if (!user || isAdmin === null) return <div className="min-h-screen"><SiteNav /><div className="container mx-auto px-6 py-20 text-muted-foreground">Loading…</div></div>;

  if (!isAdmin) {
    return (
      <div className="min-h-screen">
        <SiteNav />
        <div className="container mx-auto px-6 py-20 max-w-md text-center">
          <h1 className="text-2xl font-display">Admin access</h1>
          <p className="text-muted-foreground mt-2">If no admin exists yet, you can claim it. Otherwise, ask an existing admin to grant access.</p>
          <Button className="mt-6" onClick={tryClaim}>Claim admin</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <SiteNav />
      <div className="container mx-auto px-6 py-10">
        <h1 className="text-3xl font-display mb-6">Admin panel</h1>
        <Tabs defaultValue="dashboard">
          <TabsList><TabsTrigger value="dashboard">Dashboard</TabsTrigger><TabsTrigger value="products">Products</TabsTrigger><TabsTrigger value="orders">Orders / Sales</TabsTrigger><TabsTrigger value="faqs">FAQs</TabsTrigger><TabsTrigger value="content">Site content</TabsTrigger><TabsTrigger value="settings">Settings</TabsTrigger></TabsList>
          <TabsContent value="dashboard" className="mt-6"><DashboardTab /></TabsContent>
          <TabsContent value="products" className="mt-6"><ProductsTab /></TabsContent>
          <TabsContent value="orders" className="mt-6"><OrdersTab /></TabsContent>
          <TabsContent value="faqs" className="mt-6"><FaqsTab /></TabsContent>
          <TabsContent value="content" className="mt-6"><ContentTab /></TabsContent>
          <TabsContent value="settings" className="mt-6"><SettingsTab /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function ProductsTab() {
  const [products, setProducts] = useState<Product[]>([]);
  const [editing, setEditing] = useState<Product | null>(null);
  const [colors, setColors] = useState<ProductColor[]>([]);
  const [sizes, setSizes] = useState<ProductSize[]>([]);
  const [gallery, setGallery] = useState<ProductImage[]>([]);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);

  const load = () => supabase.from("products").select("*").order("created_at", { ascending: false }).then(({ data }) => setProducts((data as Product[]) ?? []));
  useEffect(() => { load(); }, []);

  useEffect(() => {
    supabase.from("categories").select("*").order("position").then(({ data }) => setCategories((data as Category[]) ?? []));
  }, []);

  const loadGallery = (productId: string) =>
    supabase.from("product_images").select("*").eq("product_id", productId).order("position").then(({ data }) => setGallery((data as ProductImage[]) ?? []));

  const loadSizes = (productId: string) =>
    supabase.from("product_sizes").select("*").eq("product_id", productId).order("position").then(({ data }) => setSizes((data as ProductSize[]) ?? []));

  useEffect(() => {
    setImageUrl(editing?.image_url ?? null);
    if (!editing) { setColors([]); setSizes([]); setGallery([]); return; }
    supabase.from("product_colors").select("*").eq("product_id", editing.id).then(({ data }) => setColors((data as ProductColor[]) ?? []));
    loadSizes(editing.id);
    loadGallery(editing.id);
  }, [editing]);

  const addGalleryImage = async (url: string) => {
    if (!editing) return;
    const { error } = await supabase.from("product_images").insert({ product_id: editing.id, image_url: url, position: gallery.length });
    if (error) return toast.error(error.message);
    loadGallery(editing.id);
  };

  const removeGalleryImage = async (imgId: string) => {
    await supabase.from("product_images").delete().eq("id", imgId);
    if (editing) loadGallery(editing.id);
  };

  const moveGalleryImage = async (index: number, dir: -1 | 1) => {
    if (!editing) return;
    const target = index + dir;
    if (target < 0 || target >= gallery.length) return;
    const a = gallery[index], b = gallery[target];
    await supabase.from("product_images").update({ position: b.position }).eq("id", a.id);
    await supabase.from("product_images").update({ position: a.position }).eq("id", b.id);
    loadGallery(editing.id);
  };

  const save = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const payload = {
      name: String(f.get("name")),
      description: String(f.get("description") || ""),
      price: Number(f.get("price")),
      sale_price: f.get("sale_price") ? Number(f.get("sale_price")) : null,
      on_sale: f.get("on_sale") === "on",
      image_url: imageUrl,
      whatsapp_number: String(f.get("whatsapp_number") || "") || null,
      weight: Number(f.get("weight") || 0.5),
      active: f.get("active") !== null,
      stock_quantity: f.get("stock_quantity") ? Number(f.get("stock_quantity")) : null,
      category: String(f.get("category") || "") || null,
    };
    if (payload.category && !categories.some((c) => c.name.toLowerCase() === payload.category!.toLowerCase())) {
      const { error: catErr } = await supabase.from("categories").insert({ name: payload.category, position: categories.length });
      if (!catErr) supabase.from("categories").select("*").order("position").then(({ data }) => setCategories((data as Category[]) ?? []));
    }
    if (editing) {
      const { error } = await supabase.from("products").update(payload).eq("id", editing.id);
      if (error) return toast.error(error.message);
      toast.success("Updated"); setEditing(null);
    } else {
      const { error } = await supabase.from("products").insert(payload);
      if (error) return toast.error(error.message);
      toast.success("Product added");
      (e.currentTarget as HTMLFormElement).reset();
      setImageUrl(null);
    }
    load();
  };

  const del = async (id: string) => {
    if (!confirm("Delete this product?")) return;
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Deleted"); load(); }
  };

  const addColor = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editing) return;
    const f = new FormData(e.currentTarget);
    const stock = f.get("stock");
    const { error } = await supabase.from("product_colors").insert({
      product_id: editing.id,
      name: String(f.get("cname")),
      hex: String(f.get("hex")),
      stock_quantity: stock ? Number(stock) : null,
    });
    if (error) return toast.error(error.message);
    (e.currentTarget as HTMLFormElement).reset();
    supabase.from("product_colors").select("*").eq("product_id", editing.id).then(({ data }) => setColors((data as ProductColor[]) ?? []));
  };

  const setColorStockLocal = (id: string, value: string) => {
    setColors((cs) => cs.map((c) => (c.id === id ? { ...c, stock_quantity: value === "" ? null : Number(value) } : c)));
  };
  const saveColorStock = async (id: string, value: string) => {
    await supabase.from("product_colors").update({ stock_quantity: value === "" ? null : Number(value) }).eq("id", id);
  };

  const delColor = async (id: string) => {
    await supabase.from("product_colors").delete().eq("id", id);
    if (editing) supabase.from("product_colors").select("*").eq("product_id", editing.id).then(({ data }) => setColors((data as ProductColor[]) ?? []));
  };

  const addSize = async (name: string, stock: string) => {
    if (!editing) return;
    if (sizes.some((s) => s.name.toLowerCase() === name.toLowerCase())) { toast.error("That size already exists"); return; }
    const { error } = await supabase.from("product_sizes").insert({
      product_id: editing.id,
      name,
      position: sizes.length,
      stock_quantity: stock ? Number(stock) : null,
    });
    if (error) return toast.error(error.message);
    loadSizes(editing.id);
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
    setSizes((ss) => ss.map((s) => (s.id === id ? { ...s, stock_quantity: value === "" ? null : Number(value) } : s)));
  };
  const saveSizeStock = async (id: string, value: string) => {
    await supabase.from("product_sizes").update({ stock_quantity: value === "" ? null : Number(value) }).eq("id", id);
  };

  const delSize = async (id: string) => {
    await supabase.from("product_sizes").delete().eq("id", id);
    if (editing) loadSizes(editing.id);
  };

  return (
    <div className="grid lg:grid-cols-[1fr,1.2fr] gap-8">
      <div>
        <h2 className="font-display text-xl mb-4">{editing ? `Edit: ${editing.name}` : "Add product"}</h2>
        <form onSubmit={save} className="space-y-3">
          <div><Label>Name</Label><Input name="name" required defaultValue={editing?.name ?? ""} /></div>
          <div><Label>Description</Label><Textarea name="description" defaultValue={editing?.description ?? ""} /></div>
          <div>
            <Label>Category</Label>
            <Input name="category" list="category-options" defaultValue={editing?.category ?? ""} placeholder="e.g. Men, Women, Kids" />
            <datalist id="category-options">{categories.map((c) => <option key={c.id} value={c.name} />)}</datalist>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div><Label>Price (NRS)</Label><Input name="price" type="number" step="0.01" required defaultValue={editing?.price ?? ""} /></div>
            <div><Label>Sale price</Label><Input name="sale_price" type="number" step="0.01" defaultValue={editing?.sale_price ?? ""} /></div>
            <div><Label>Weight (kg)</Label><Input name="weight" type="number" step="0.1" min="0.5" max="10" defaultValue={editing?.weight ?? 0.5} /></div>
          </div>
          <div>
            <Label>Stock quantity</Label>
            <Input name="stock_quantity" type="number" min="0" step="1" defaultValue={editing?.stock_quantity ?? ""} placeholder="Leave blank for unlimited / untracked" />
            <p className="text-xs text-muted-foreground mt-1">If this product has colors or sizes below, each variant's own stock is used instead and this field is ignored.</p>
          </div>
          <div className="flex items-center gap-2"><input id="on_sale" name="on_sale" type="checkbox" defaultChecked={editing?.on_sale} /><Label htmlFor="on_sale">Mark as on sale</Label></div>
          <div className="flex items-center gap-2"><input id="active" name="active" type="checkbox" defaultChecked={editing?.active ?? true} /><Label htmlFor="active">Active (visible in shop)</Label></div>
          <ImageUpload bucket="product-images" value={imageUrl} onChange={setImageUrl} label="Product image" />
          <div><Label>WhatsApp number (override)</Label><Input name="whatsapp_number" defaultValue={editing?.whatsapp_number ?? ""} placeholder="9779841234567" /></div>
          <div className="flex gap-2">
            <Button>{editing ? "Save changes" : "Add product"}</Button>
            {editing && <Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancel</Button>}
          </div>
        </form>

        {editing && (
          <div className="mt-8 border-t pt-6">
            <h3 className="font-medium mb-3">Gallery images</h3>
            <p className="text-xs text-muted-foreground mb-3">Extra photos shown on this product's page, alongside the cover image above.</p>
            <div className="flex flex-wrap gap-3 mb-3">
              {gallery.map((img, i) => (
                <div key={img.id} className="relative size-20 rounded-md border overflow-hidden group">
                  <img src={img.image_url} alt="" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-1.5">
                    {i > 0 && <button type="button" onClick={() => moveGalleryImage(i, -1)} className="text-white text-sm leading-none">‹</button>}
                    <button type="button" onClick={() => removeGalleryImage(img.id)} className="text-white"><Trash2 className="size-3.5" /></button>
                    {i < gallery.length - 1 && <button type="button" onClick={() => moveGalleryImage(i, 1)} className="text-white text-sm leading-none">›</button>}
                  </div>
                </div>
              ))}
              {gallery.length === 0 && <span className="text-xs text-muted-foreground">No gallery images yet</span>}
            </div>
            <ImageUpload bucket="product-images" value={null} onChange={(url) => url && addGalleryImage(url)} label="Add an image" />
          </div>
        )}

        {editing && (
          <div className="mt-8 border-t pt-6">
            <h3 className="font-medium mb-3">Colors</h3>
            <div className="space-y-2 mb-3">
              {colors.map((c) => (
                <div key={c.id} className="flex items-center gap-2 border rounded-md px-3 py-2 text-sm">
                  <span className="size-5 rounded-full border shrink-0" style={{ background: c.hex }} />
                  <span className="flex-1 truncate">{c.name}</span>
                  <Label className="text-xs text-muted-foreground">Stock</Label>
                  <Input
                    type="number" min="0" step="1" placeholder="∞"
                    value={c.stock_quantity ?? ""}
                    onChange={(e) => setColorStockLocal(c.id, e.target.value)}
                    onBlur={(e) => saveColorStock(c.id, e.target.value)}
                    className="w-20"
                  />
                  <button type="button" onClick={() => delColor(c.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="size-3.5" /></button>
                </div>
              ))}
              {colors.length === 0 && <span className="text-xs text-muted-foreground">No colors yet</span>}
            </div>
            <form onSubmit={addColor} className="flex gap-2">
              <Input name="cname" placeholder="Color name (e.g. Sand)" required className="flex-1" />
              <Input name="hex" type="color" defaultValue="#d4a574" className="w-16" />
              <Input name="stock" type="number" min="0" step="1" placeholder="Stock (∞)" className="w-28" />
              <Button type="submit" variant="outline">Add color</Button>
            </form>
          </div>
        )}

        {editing && (
          <div className="mt-8 border-t pt-6">
            <h3 className="font-medium mb-3">Sizes</h3>
            <div className="flex flex-wrap gap-2 mb-3">
              {STANDARD_SIZES.filter((std) => !sizes.some((s) => s.name.toLowerCase() === std.toLowerCase())).map((std) => (
                <button key={std} type="button" onClick={() => addSize(std, "")} className="text-xs border rounded-md px-2.5 py-1.5 hover:border-accent hover:text-accent transition">
                  + {std}
                </button>
              ))}
            </div>
            <div className="space-y-2 mb-3">
              {sizes.map((s) => (
                <div key={s.id} className="flex items-center gap-2 border rounded-md px-3 py-2 text-sm">
                  <span className="flex-1 font-medium">{s.name}</span>
                  <Label className="text-xs text-muted-foreground">Stock</Label>
                  <Input
                    type="number" min="0" step="1" placeholder="∞"
                    value={s.stock_quantity ?? ""}
                    onChange={(e) => setSizeStockLocal(s.id, e.target.value)}
                    onBlur={(e) => saveSizeStock(s.id, e.target.value)}
                    className="w-20"
                  />
                  <button type="button" onClick={() => delSize(s.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="size-3.5" /></button>
                </div>
              ))}
              {sizes.length === 0 && <span className="text-xs text-muted-foreground">No sizes yet — use the quick-add buttons above, or add a custom one below</span>}
            </div>
            <form onSubmit={addSizeForm} className="flex gap-2">
              <Input name="sname" placeholder="Custom size (e.g. 32W)" required className="flex-1" />
              <Input name="sstock" type="number" min="0" step="1" placeholder="Stock (∞)" className="w-28" />
              <Button type="submit" variant="outline">Add size</Button>
            </form>
            <p className="text-xs text-muted-foreground mt-2">Sizes and colors are tracked as independent stock pools (not a combined "Red, size M" matrix). If a product has colors, color stock governs checkout; otherwise size stock does.</p>
          </div>
        )}
      </div>

      <div>
        <h2 className="font-display text-xl mb-4">All products ({products.length})</h2>
        <div className="border rounded-md divide-y">
          {products.map((p) => (
            <div key={p.id} className="p-3 flex items-center gap-3">
              <div className="size-12 bg-muted rounded overflow-hidden shrink-0">{p.image_url && <img src={p.image_url} alt="" className="w-full h-full object-cover" />}</div>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{p.name}</div>
                <div className="text-xs text-muted-foreground">NRS {p.price}{p.on_sale && p.sale_price ? ` → NRS ${p.sale_price}` : ""} {p.category && `· ${p.category}`} {!p.active && "· hidden"} {p.stock_quantity === 0 && <span className="text-destructive">· out of stock</span>} {p.stock_quantity !== null && p.stock_quantity > 0 && `· ${p.stock_quantity} in stock`}</div>
              </div>
              <Button size="sm" variant="outline" onClick={() => setEditing(p)}>Edit</Button>
              <Button size="sm" variant="ghost" onClick={() => del(p.id)}><Trash2 className="size-4" /></Button>
            </div>
          ))}
          {products.length === 0 && <div className="p-6 text-sm text-muted-foreground">No products yet.</div>}
        </div>
      </div>
    </div>
  );
}

function DashboardTab() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from("orders").select("*").order("created_at", { ascending: false })
      .then(({ data }) => { setOrders((data as Order[]) ?? []); setLoading(false); });
  }, []);

  if (loading) return <p className="text-muted-foreground text-sm">Loading…</p>;

  const validOrders = orders.filter((o) => o.status !== "cancelled");
  const totalRevenue = validOrders.reduce((s, o) => s + Number(o.total), 0);
  const avgOrder = validOrders.length ? totalRevenue / validOrders.length : 0;
  const pending = orders.filter((o) => o.status === "pending").length;

  const days: { date: string; revenue: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dayStr = d.toDateString();
    const revenue = validOrders.filter((o) => new Date(o.created_at).toDateString() === dayStr).reduce((s, o) => s + Number(o.total), 0);
    days.push({ date: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }), revenue });
  }

  const byProduct = new Map<string, { qty: number; revenue: number }>();
  validOrders.forEach((o) => {
    const cur = byProduct.get(o.product_name) ?? { qty: 0, revenue: 0 };
    cur.qty += o.quantity;
    cur.revenue += Number(o.total);
    byProduct.set(o.product_name, cur);
  });
  const topProducts = [...byProduct.entries()].sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 5).map(([name, v]) => ({ name, ...v }));

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Total revenue" value={`NRS ${totalRevenue.toFixed(0)}`} />
        <Stat label="Total orders" value={orders.length.toString()} />
        <Stat label="Avg order value" value={`NRS ${avgOrder.toFixed(0)}`} />
        <Stat label="Pending" value={pending.toString()} />
      </div>

      <div>
        <h3 className="font-medium mb-3 text-sm text-muted-foreground">Revenue, last 14 days</h3>
        <div className="h-56 border rounded-md p-3">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={days}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" fontSize={11} tickLine={false} />
              <YAxis fontSize={11} tickLine={false} width={40} />
              <Tooltip formatter={(v: number) => [`NRS ${v}`, "Revenue"]} />
              <Line type="monotone" dataKey="revenue" stroke="var(--accent)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div>
        <h3 className="font-medium mb-3 text-sm text-muted-foreground">Top products by revenue</h3>
        <div className="h-56 border rounded-md p-3">
          {topProducts.length === 0 ? (
            <div className="h-full grid place-items-center text-sm text-muted-foreground">No sales yet</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topProducts} layout="vertical" margin={{ left: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis type="number" fontSize={11} tickLine={false} />
                <YAxis type="category" dataKey="name" fontSize={11} tickLine={false} width={120} />
                <Tooltip formatter={(v: number) => [`NRS ${v}`, "Revenue"]} />
                <Bar dataKey="revenue" fill="var(--accent)" radius={4} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}

function OrdersTab() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [syncing, setSyncing] = useState<string | null>(null);
  const runSync = useServerFn(syncOrderStatus);
  const load = () => supabase.from("orders").select("*").order("created_at", { ascending: false }).then(({ data }) => setOrders((data as Order[]) ?? []));
  useEffect(() => { load(); }, []);

  const setStatus = async (id: string, status: string) => {
    await supabase.from("orders").update({ status }).eq("id", id);
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

  const totalSales = orders.filter((o) => o.status !== "cancelled").reduce((s, o) => s + Number(o.total), 0);

  return (
    <div>
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Stat label="Total orders" value={orders.length.toString()} />
        <Stat label="Total sales" value={`NRS ${totalSales.toFixed(0)}`} />
        <Stat label="Submitted to Pathao" value={orders.filter((o) => o.pathao_consignment_id).length.toString()} />
      </div>
      <div className="border rounded-md divide-y">
        {orders.map((o) => (
          <div key={o.id} className="p-4 grid md:grid-cols-[1fr,1fr,auto] gap-3 items-center">
            <div>
              <div className="font-medium">{o.product_name} {o.color && <span className="text-muted-foreground">· {o.color}</span>} {o.size && <span className="text-muted-foreground">· {o.size}</span>} <span className="text-xs text-muted-foreground">× {o.quantity}</span></div>
              <div className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString()}</div>
              {o.pathao_consignment_id && (
                <div className="text-xs text-accent flex items-center gap-1.5">
                  Pathao #{o.pathao_consignment_id}
                  {o.pathao_status && <span className="text-muted-foreground">· {o.pathao_status.replace(/_/g, " ")}</span>}
                  <button type="button" onClick={() => refreshPathaoStatus(o.id)} disabled={syncing === o.id} title="Refresh status from Pathao" className="text-muted-foreground hover:text-foreground disabled:opacity-40">
                    <RefreshCw className={`size-3 ${syncing === o.id ? "animate-spin" : ""}`} />
                  </button>
                </div>
              )}
            </div>
            <div className="text-sm">
              <div>{o.customer_name} · {o.customer_phone}</div>
              <div className="text-muted-foreground text-xs">{o.customer_address}</div>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-right">
                <div className="tabular-nums font-medium">NRS {o.total}</div>
                <div className="text-xs capitalize text-muted-foreground">{o.status.replace(/_/g, " ")}</div>
              </div>
              <select value={o.status} onChange={(e) => setStatus(o.id, e.target.value)} className="text-xs border rounded px-2 py-1 bg-background">
                <option value="pending">pending</option>
                <option value="submitted">submitted</option>
                <option value="shipped">shipped</option>
                <option value="delivered">delivered</option>
                <option value="cancelled">cancelled</option>
              </select>
            </div>
          </div>
        ))}
        {orders.length === 0 && <div className="p-6 text-sm text-muted-foreground">No orders yet.</div>}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="border rounded-md p-4"><div className="text-xs text-muted-foreground">{label}</div><div className="text-2xl font-display mt-1">{value}</div></div>;
}

function FaqsTab() {
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [editing, setEditing] = useState<Faq | null>(null);

  const load = () => supabase.from("faqs").select("*").order("position").then(({ data }) => setFaqs((data as Faq[]) ?? []));
  useEffect(() => { load(); }, []);

  const save = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const payload = {
      question: String(f.get("question") || "").trim(),
      answer: String(f.get("answer") || "").trim(),
      active: f.get("active") !== null,
    };
    if (!payload.question || !payload.answer) return toast.error("Question and answer are required");
    if (editing) {
      const { error } = await supabase.from("faqs").update(payload).eq("id", editing.id);
      if (error) return toast.error(error.message);
      toast.success("Updated"); setEditing(null);
    } else {
      const { error } = await supabase.from("faqs").insert({ ...payload, position: faqs.length });
      if (error) return toast.error(error.message);
      toast.success("FAQ added");
      (e.currentTarget as HTMLFormElement).reset();
    }
    load();
  };

  const del = async (id: string) => {
    if (!confirm("Delete this FAQ?")) return;
    await supabase.from("faqs").delete().eq("id", id);
    load();
  };

  const move = async (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= faqs.length) return;
    const a = faqs[index], b = faqs[target];
    await supabase.from("faqs").update({ position: b.position }).eq("id", a.id);
    await supabase.from("faqs").update({ position: a.position }).eq("id", b.id);
    load();
  };

  return (
    <div className="grid lg:grid-cols-[1fr,1.2fr] gap-8">
      <div>
        <h2 className="font-display text-xl mb-4">{editing ? "Edit FAQ" : "Add FAQ"}</h2>
        <form onSubmit={save} className="space-y-3">
          <div><Label>Question</Label><Input name="question" required defaultValue={editing?.question ?? ""} /></div>
          <div><Label>Answer</Label><Textarea name="answer" rows={4} required defaultValue={editing?.answer ?? ""} /></div>
          <div className="flex items-center gap-2"><input id="faq_active" name="active" type="checkbox" defaultChecked={editing?.active ?? true} /><Label htmlFor="faq_active">Visible on site</Label></div>
          <div className="flex gap-2">
            <Button>{editing ? "Save changes" : "Add FAQ"}</Button>
            {editing && <Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancel</Button>}
          </div>
        </form>
        <p className="text-xs text-muted-foreground mt-4">Shown publicly at /faq, ordered top to bottom. Use the arrows on the right to reorder.</p>
      </div>
      <div>
        <h2 className="font-display text-xl mb-4">All FAQs ({faqs.length})</h2>
        <div className="border rounded-md divide-y">
          {faqs.map((f, i) => (
            <div key={f.id} className="p-3 flex items-start gap-3">
              <div className="flex flex-col gap-0.5 pt-1">
                <button type="button" disabled={i === 0} onClick={() => move(i, -1)} className="text-muted-foreground hover:text-foreground disabled:opacity-30 text-xs leading-none">▲</button>
                <button type="button" disabled={i === faqs.length - 1} onClick={() => move(i, 1)} className="text-muted-foreground hover:text-foreground disabled:opacity-30 text-xs leading-none">▼</button>
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{f.question} {!f.active && <span className="text-xs text-muted-foreground">· hidden</span>}</div>
                <div className="text-xs text-muted-foreground line-clamp-2">{f.answer}</div>
              </div>
              <Button size="sm" variant="outline" onClick={() => setEditing(f)}>Edit</Button>
              <Button size="sm" variant="ghost" onClick={() => del(f.id)}><Trash2 className="size-4" /></Button>
            </div>
          ))}
          {faqs.length === 0 && <div className="p-6 text-sm text-muted-foreground">No FAQs yet.</div>}
        </div>
      </div>
    </div>
  );
}

function ContentTab() {
  const [vals, setVals] = useState<Record<string, string>>({});
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    supabase.from("app_settings").select("*").then(({ data }) => {
      const obj: Record<string, string> = {};
      (data ?? []).forEach((r: { key: string; value: string | null }) => { obj[r.key] = r.value ?? ""; });
      setVals(obj);
    });
    supabase.from("categories").select("*").order("position").then(({ data }) => setCategories((data as Category[]) ?? []));
  }, []);

  const save = async (key: string) => {
    const { error } = await supabase.from("app_settings").upsert({ key, value: vals[key] ?? "", updated_at: new Date().toISOString() });
    if (error) toast.error(error.message); else toast.success("Saved");
  };
  const saveValue = async (key: string, value: string) => {
    const { error } = await supabase.from("app_settings").upsert({ key, value, updated_at: new Date().toISOString() });
    if (error) toast.error(error.message); else toast.success("Saved");
  };

  const field = (key: string, label: string, hint?: string, multiline?: boolean) => (
    <div className="space-y-1">
      <Label>{label}</Label>
      <div className="flex gap-2">
        {multiline ? (
          <Textarea value={vals[key] ?? ""} onChange={(e) => setVals({ ...vals, [key]: e.target.value })} />
        ) : (
          <Input value={vals[key] ?? ""} onChange={(e) => setVals({ ...vals, [key]: e.target.value })} />
        )}
        <Button onClick={() => save(key)} className="shrink-0">Save</Button>
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );

  const imageField = (key: string, label: string, hint?: string) => (
    <div className="space-y-1">
      <ImageUpload
        bucket="site-assets"
        value={vals[key] || null}
        onChange={(url) => { const v = url ?? ""; setVals((p) => ({ ...p, [key]: v })); saveValue(key, v); }}
        label={label}
      />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );

  const addCategory = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const name = String(f.get("category") || "").trim();
    if (!name) return;
    const { error } = await supabase.from("categories").insert({ name, position: categories.length });
    if (error) return toast.error(error.message);
    (e.currentTarget as HTMLFormElement).reset();
    supabase.from("categories").select("*").order("position").then(({ data }) => setCategories((data as Category[]) ?? []));
  };

  const delCategory = async (id: string) => {
    await supabase.from("categories").delete().eq("id", id);
    supabase.from("categories").select("*").order("position").then(({ data }) => setCategories((data as Category[]) ?? []));
  };

  return (
    <div className="max-w-xl space-y-8">
      <div className="space-y-4">
        <h3 className="font-medium">Announcement bar</h3>
        <p className="text-xs text-muted-foreground -mt-2">Shown as a thin strip above the header on every page. Leave text blank to hide it.</p>
        {field("announcement_text", "Text", "e.g. Free delivery on orders over NRS 2000")}
        {field("announcement_link", "Link (optional)", "Where the bar links to when clicked, e.g. /sale")}
      </div>

      <div className="border-t pt-6 space-y-4">
        <h3 className="font-medium">About section</h3>
        <p className="text-xs text-muted-foreground -mt-2">Shown on the homepage, below the shop grid.</p>
        {field("about_title", "Title")}
        {field("about_body", "Body text", undefined, true)}
        {imageField("about_image_url", "Image")}
      </div>

      <div className="border-t pt-6 space-y-4">
        <h3 className="font-medium">Categories</h3>
        <p className="text-xs text-muted-foreground -mt-2">Used for product tagging and the homepage filter bar.</p>
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <span key={c.id} className="flex items-center gap-1.5 text-xs border rounded-full pl-3 pr-2 py-1">
              {c.name}
              <button type="button" onClick={() => delCategory(c.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="size-3" /></button>
            </span>
          ))}
          {categories.length === 0 && <span className="text-xs text-muted-foreground">No categories yet</span>}
        </div>
        <form onSubmit={addCategory} className="flex gap-2">
          <Input name="category" placeholder="New category (e.g. Outerwear)" required className="flex-1" />
          <Button type="submit" variant="outline">Add</Button>
        </form>
      </div>

      <div className="border-t pt-6 space-y-4">
        <h3 className="font-medium">FAQ section heading</h3>
        {field("faq_heading", "Heading", "Shown above the FAQ list on the /faq page")}
      </div>

      <div className="border-t pt-6 space-y-4">
        <h3 className="font-medium">Footer</h3>
        {field("footer_text", "Footer note", "Optional line shown next to the copyright, e.g. your business registration info")}
        {field("contact_email", "Contact email")}
        {field("contact_phone", "Contact phone")}
        {field("social_instagram", "Instagram URL")}
        {field("social_facebook", "Facebook URL")}
        {field("social_tiktok", "TikTok URL")}
      </div>
    </div>
  );
}


function SettingsTab() {
  const [vals, setVals] = useState<Record<string, string>>({});
  const [stores, setStores] = useState<{ store_id: number; store_name: string; store_address: string }[] | null>(null);
  const [storesLoading, setStoresLoading] = useState(false);
  const fetchStores = useServerFn(getPathaoStores);

  useEffect(() => {
    supabase.from("app_settings").select("*").then(({ data }) => {
      const obj: Record<string, string> = {};
      (data ?? []).forEach((r: { key: string; value: string | null }) => { obj[r.key] = r.value ?? ""; });
      setVals(obj);
    });
  }, []);

  const save = async (key: string) => {
    const { error } = await supabase.from("app_settings").upsert({ key, value: vals[key] ?? "", updated_at: new Date().toISOString() });
    if (error) toast.error(error.message); else toast.success("Saved");
  };

  const saveValue = async (key: string, value: string) => {
    const { error } = await supabase.from("app_settings").upsert({ key, value, updated_at: new Date().toISOString() });
    if (error) toast.error(error.message); else toast.success("Saved");
  };

  const loadStores = async () => {
    setStoresLoading(true);
    try {
      const res = (await fetchStores()) as { data?: { data?: { store_id: number; store_name: string; store_address: string }[] }; error?: string };
      if (res?.error) { toast.error(res.error); setStores([]); return; }
      setStores(res?.data?.data ?? []);
    } catch (e) {
      toast.error(`Couldn't fetch stores: ${String(e)}`);
      setStores([]);
    } finally {
      setStoresLoading(false);
    }
  };

  const chooseStore = (storeId: number) => {
    setVals((p) => ({ ...p, pathao_store_id: String(storeId) }));
    saveValue("pathao_store_id", String(storeId));
  };

  const field = (key: string, label: string, hint?: string) => (
    <div className="space-y-1">
      <Label>{label}</Label>
      <div className="flex gap-2"><Input value={vals[key] ?? ""} onChange={(e) => setVals({ ...vals, [key]: e.target.value })} /><Button onClick={() => save(key)}>Save</Button></div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );

  const colorField = (key: string, label: string) => (
    <div className="space-y-1">
      <Label>{label}</Label>
      <div className="flex gap-2 items-center">
        <input type="color" value={vals[key] || "#c4762d"} onChange={(e) => setVals({ ...vals, [key]: e.target.value })} className="size-9 rounded border cursor-pointer" />
        <Input value={vals[key] ?? ""} placeholder="Leave blank for default" onChange={(e) => setVals({ ...vals, [key]: e.target.value })} />
        <Button onClick={() => save(key)}>Save</Button>
      </div>
    </div>
  );

  const imageField = (key: "logo_url" | "hero_image_url", label: string, hint?: string) => (
    <div className="space-y-1">
      <ImageUpload
        bucket="site-assets"
        value={vals[key] || null}
        onChange={(url) => { const v = url ?? ""; setVals((p) => ({ ...p, [key]: v })); saveValue(key, v); }}
        label={label}
      />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );

  return (
    <div className="max-w-xl space-y-6">
      {field("store_name", "Store name")}
      {imageField("logo_url", "Logo", "Shown in the header. Leave empty to use the store name as text.")}
      {colorField("theme_accent", "Accent color")}
      <div className="border-t pt-6 space-y-4">
        <h3 className="font-medium">Homepage hero</h3>
        {field("hero_title", "Hero title")}
        {field("hero_subtitle", "Hero subtitle")}
        {imageField("hero_image_url", "Hero banner image", "Optional. Shown behind the hero text on the homepage.")}
      </div>
      {field("whatsapp_number", "Default WhatsApp number", "Used on product pages when product has no override. Format: 9779841234567")}
      {field("pathao_store_id", "Pathao Store ID", "Get this from the Pathao merchant dashboard, or fetch your stores below. Required for creating Pathao orders.")}
      <div className="space-y-2">
        <Button type="button" variant="outline" size="sm" onClick={loadStores} disabled={storesLoading}>
          {storesLoading ? "Fetching…" : "Fetch my Pathao stores"}
        </Button>
        {stores !== null && (
          stores.length === 0 ? (
            <p className="text-xs text-muted-foreground">No stores found on this Pathao account, or the credentials aren't set up yet.</p>
          ) : (
            <div className="border rounded-md divide-y">
              {stores.map((s) => (
                <button key={s.store_id} type="button" onClick={() => chooseStore(s.store_id)}
                  className={`w-full text-left p-3 text-sm hover:bg-muted/50 transition ${vals.pathao_store_id === String(s.store_id) ? "bg-accent/10" : ""}`}>
                  <div className="font-medium">{s.store_name} {vals.pathao_store_id === String(s.store_id) && <span className="text-accent text-xs">· selected</span>}</div>
                  <div className="text-xs text-muted-foreground">{s.store_address} · ID {s.store_id}</div>
                </button>
              ))}
            </div>
          )
        )}
      </div>
      <div className="text-xs text-muted-foreground border-t pt-4">Pathao API uses sandbox credentials by default. Set PATHAO_CLIENT_ID, PATHAO_CLIENT_SECRET, PATHAO_USERNAME, PATHAO_PASSWORD, PATHAO_BASE_URL secrets to go live.</div>
    </div>
  );
}
