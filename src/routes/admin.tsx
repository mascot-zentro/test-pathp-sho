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
import { Trash2 } from "lucide-react";
import { ImageUpload } from "@/components/image-upload";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export const Route = createFileRoute("/admin")({
  ssr: false,
  component: Admin,
});

type Product = { id: string; name: string; description: string | null; price: number; sale_price: number | null; on_sale: boolean; image_url: string | null; whatsapp_number: string | null; weight: number; active: boolean; stock_quantity: number | null };
type ProductColor = { id: string; product_id: string; name: string; hex: string; stock_quantity: number | null };
type ProductImage = { id: string; product_id: string; image_url: string; position: number };
type Order = { id: string; product_name: string; color: string | null; quantity: number; total: number; customer_name: string; customer_phone: string; customer_address: string; status: string; pathao_consignment_id: string | null; created_at: string };

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
          <TabsList><TabsTrigger value="dashboard">Dashboard</TabsTrigger><TabsTrigger value="products">Products</TabsTrigger><TabsTrigger value="orders">Orders / Sales</TabsTrigger><TabsTrigger value="settings">Settings</TabsTrigger></TabsList>
          <TabsContent value="dashboard" className="mt-6"><DashboardTab /></TabsContent>
          <TabsContent value="products" className="mt-6"><ProductsTab /></TabsContent>
          <TabsContent value="orders" className="mt-6"><OrdersTab /></TabsContent>
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
  const [gallery, setGallery] = useState<ProductImage[]>([]);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  const load = () => supabase.from("products").select("*").order("created_at", { ascending: false }).then(({ data }) => setProducts((data as Product[]) ?? []));
  useEffect(() => { load(); }, []);

  const loadGallery = (productId: string) =>
    supabase.from("product_images").select("*").eq("product_id", productId).order("position").then(({ data }) => setGallery((data as ProductImage[]) ?? []));

  useEffect(() => {
    setImageUrl(editing?.image_url ?? null);
    if (!editing) { setColors([]); setGallery([]); return; }
    supabase.from("product_colors").select("*").eq("product_id", editing.id).then(({ data }) => setColors((data as ProductColor[]) ?? []));
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
    };
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

  return (
    <div className="grid lg:grid-cols-[1fr,1.2fr] gap-8">
      <div>
        <h2 className="font-display text-xl mb-4">{editing ? `Edit: ${editing.name}` : "Add product"}</h2>
        <form onSubmit={save} className="space-y-3">
          <div><Label>Name</Label><Input name="name" required defaultValue={editing?.name ?? ""} /></div>
          <div><Label>Description</Label><Textarea name="description" defaultValue={editing?.description ?? ""} /></div>
          <div className="grid grid-cols-3 gap-2">
            <div><Label>Price (৳)</Label><Input name="price" type="number" step="0.01" required defaultValue={editing?.price ?? ""} /></div>
            <div><Label>Sale price</Label><Input name="sale_price" type="number" step="0.01" defaultValue={editing?.sale_price ?? ""} /></div>
            <div><Label>Weight (kg)</Label><Input name="weight" type="number" step="0.1" min="0.5" max="10" defaultValue={editing?.weight ?? 0.5} /></div>
          </div>
          <div>
            <Label>Stock quantity</Label>
            <Input name="stock_quantity" type="number" min="0" step="1" defaultValue={editing?.stock_quantity ?? ""} placeholder="Leave blank for unlimited / untracked" />
            <p className="text-xs text-muted-foreground mt-1">If this product has colors below, each color's own stock is used instead and this field is ignored.</p>
          </div>
          <div className="flex items-center gap-2"><input id="on_sale" name="on_sale" type="checkbox" defaultChecked={editing?.on_sale} /><Label htmlFor="on_sale">Mark as on sale</Label></div>
          <div className="flex items-center gap-2"><input id="active" name="active" type="checkbox" defaultChecked={editing?.active ?? true} /><Label htmlFor="active">Active (visible in shop)</Label></div>
          <ImageUpload bucket="product-images" value={imageUrl} onChange={setImageUrl} label="Product image" />
          <div><Label>WhatsApp number (override)</Label><Input name="whatsapp_number" defaultValue={editing?.whatsapp_number ?? ""} placeholder="8801XXXXXXXXX" /></div>
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
      </div>

      <div>
        <h2 className="font-display text-xl mb-4">All products ({products.length})</h2>
        <div className="border rounded-md divide-y">
          {products.map((p) => (
            <div key={p.id} className="p-3 flex items-center gap-3">
              <div className="size-12 bg-muted rounded overflow-hidden shrink-0">{p.image_url && <img src={p.image_url} alt="" className="w-full h-full object-cover" />}</div>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{p.name}</div>
                <div className="text-xs text-muted-foreground">৳{p.price}{p.on_sale && p.sale_price ? ` → ৳${p.sale_price}` : ""} {!p.active && "· hidden"} {p.stock_quantity === 0 && <span className="text-destructive">· out of stock</span>} {p.stock_quantity !== null && p.stock_quantity > 0 && `· ${p.stock_quantity} in stock`}</div>
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
        <Stat label="Total revenue" value={`৳${totalRevenue.toFixed(0)}`} />
        <Stat label="Total orders" value={orders.length.toString()} />
        <Stat label="Avg order value" value={`৳${avgOrder.toFixed(0)}`} />
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
              <Tooltip formatter={(v: number) => [`৳${v}`, "Revenue"]} />
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
                <Tooltip formatter={(v: number) => [`৳${v}`, "Revenue"]} />
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
  const load = () => supabase.from("orders").select("*").order("created_at", { ascending: false }).then(({ data }) => setOrders((data as Order[]) ?? []));
  useEffect(() => { load(); }, []);

  const setStatus = async (id: string, status: string) => {
    await supabase.from("orders").update({ status }).eq("id", id);
    load();
  };

  const totalSales = orders.filter((o) => o.status !== "cancelled").reduce((s, o) => s + Number(o.total), 0);

  return (
    <div>
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Stat label="Total orders" value={orders.length.toString()} />
        <Stat label="Total sales" value={`৳${totalSales.toFixed(0)}`} />
        <Stat label="Submitted to Pathao" value={orders.filter((o) => o.pathao_consignment_id).length.toString()} />
      </div>
      <div className="border rounded-md divide-y">
        {orders.map((o) => (
          <div key={o.id} className="p-4 grid md:grid-cols-[1fr,1fr,auto] gap-3 items-center">
            <div>
              <div className="font-medium">{o.product_name} {o.color && <span className="text-muted-foreground">· {o.color}</span>} <span className="text-xs text-muted-foreground">× {o.quantity}</span></div>
              <div className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString()}</div>
              {o.pathao_consignment_id && <div className="text-xs text-accent">Pathao #{o.pathao_consignment_id}</div>}
            </div>
            <div className="text-sm">
              <div>{o.customer_name} · {o.customer_phone}</div>
              <div className="text-muted-foreground text-xs">{o.customer_address}</div>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-right">
                <div className="tabular-nums font-medium">৳{o.total}</div>
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

function SettingsTab() {
  const [vals, setVals] = useState<Record<string, string>>({});
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
      {field("whatsapp_number", "Default WhatsApp number", "Used on product pages when product has no override. Format: 8801XXXXXXXXX")}
      {field("pathao_store_id", "Pathao Store ID", "Get this from the Pathao merchant dashboard. Required for creating Pathao orders.")}
      <div className="text-xs text-muted-foreground border-t pt-4">Pathao API uses sandbox credentials by default. Set PATHAO_CLIENT_ID, PATHAO_CLIENT_SECRET, PATHAO_USERNAME, PATHAO_PASSWORD, PATHAO_BASE_URL secrets to go live.</div>
    </div>
  );
}
