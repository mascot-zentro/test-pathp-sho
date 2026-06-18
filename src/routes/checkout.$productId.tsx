import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getCities, getZones, getAreas, createOrder, getDeliveryEstimate } from "@/lib/pathao.functions";

export const Route = createFileRoute("/checkout/$productId")({
  validateSearch: z.object({ color: z.string().optional(), size: z.string().optional() }).parse,
  component: Checkout,
});

type Product = { id: string; name: string; price: number; sale_price: number | null; on_sale: boolean; weight: number };

function Checkout() {
  const { productId } = Route.useParams();
  const { color, size } = Route.useSearch();
  const navigate = useNavigate();
  const [product, setProduct] = useState<Product | null>(null);
  const [qty, setQty] = useState(1);
  const [availableStock, setAvailableStock] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", address: "", instruction: "", company: "" });
  const [cities, setCities] = useState<{ city_id: number; city_name: string }[]>([]);
  const [zones, setZones] = useState<{ zone_id: number; zone_name: string }[]>([]);
  const [areas, setAreas] = useState<{ area_id: number; area_name: string }[]>([]);
  const [cityId, setCityId] = useState<number | null>(null);
  const [zoneId, setZoneId] = useState<number | null>(null);
  const [areaId, setAreaId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pathaoUp, setPathaoUp] = useState(true);
  const [deliveryFee, setDeliveryFee] = useState<number | null>(null);
  const [deliveryFeeLoading, setDeliveryFeeLoading] = useState(false);

  const fetchCities = useServerFn(getCities);
  const fetchZones = useServerFn(getZones);
  const fetchAreas = useServerFn(getAreas);
  const submitOrder = useServerFn(createOrder);
  const fetchDeliveryEstimate = useServerFn(getDeliveryEstimate);

  useEffect(() => {
    supabase.from("products").select("id,name,price,sale_price,on_sale,weight").eq("id", productId).maybeSingle()
      .then(({ data }) => setProduct(data as Product | null));
    fetchCities().then((res: unknown) => {
      const r = res as { data?: { data?: { city_id: number; city_name: string }[] } };
      const list = r?.data?.data;
      if (Array.isArray(list)) setCities(list);
      else setPathaoUp(false);
    }).catch(() => setPathaoUp(false));
  }, [productId, fetchCities]);

  useEffect(() => {
    if (!cityId) return;
    setZones([]); setAreas([]); setZoneId(null); setAreaId(null);
    fetchZones({ data: { cityId } }).then((res: unknown) => {
      const r = res as { data?: { data?: { zone_id: number; zone_name: string }[] } };
      if (Array.isArray(r?.data?.data)) setZones(r.data.data);
    });
  }, [cityId, fetchZones]);

  useEffect(() => {
    if (!zoneId) return;
    setAreas([]); setAreaId(null);
    fetchAreas({ data: { zoneId } }).then((res: unknown) => {
      const r = res as { data?: { data?: { area_id: number; area_name: string }[] } };
      if (Array.isArray(r?.data?.data)) setAreas(r.data.data);
    });
  }, [zoneId, fetchAreas]);

  useEffect(() => {
    // Same fix as the product page: a product's effective stock is the
    // most restrictive of its color and size caps, not "color wins".
    const load = async () => {
      if (!color && !size) {
        const { data } = await supabase.from("products").select("stock_quantity").eq("id", productId).maybeSingle();
        setAvailableStock((data as { stock_quantity: number | null } | null)?.stock_quantity ?? null);
        return;
      }
      const [colorRes, sizeRes] = await Promise.all([
        color
          ? supabase.from("product_colors").select("stock_quantity").eq("product_id", productId).eq("name", color).maybeSingle()
          : Promise.resolve({ data: null }),
        size
          ? supabase.from("product_sizes").select("stock_quantity").eq("product_id", productId).eq("name", size).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      const limits = [colorRes.data, sizeRes.data]
        .map((d) => (d as { stock_quantity: number | null } | null)?.stock_quantity)
        .filter((v): v is number => v !== null && v !== undefined);
      setAvailableStock(limits.length > 0 ? Math.min(...limits) : null);
    };
    load();
  }, [productId, color, size]);

  useEffect(() => {
    if (availableStock !== null && qty > availableStock) setQty(Math.max(1, availableStock));
  }, [availableStock, qty]);

  useEffect(() => {
    if (!cityId || !zoneId || !product) { setDeliveryFee(null); return; }
    setDeliveryFeeLoading(true);
    fetchDeliveryEstimate({ data: { cityId, zoneId, weight: Number(product.weight) || 0.5 } })
      .then((fee: unknown) => setDeliveryFee(typeof fee === "number" ? fee : null))
      .catch(() => setDeliveryFee(null))
      .finally(() => setDeliveryFeeLoading(false));
  }, [cityId, zoneId, product, fetchDeliveryEstimate]);

  if (!product) return <div className="min-h-screen"><SiteNav /><div className="container mx-auto px-6 py-20 text-muted-foreground">Loading…</div></div>;

  const outOfStock = availableStock === 0;
  const unit = product.on_sale && product.sale_price ? product.sale_price : product.price;
  const subtotal = Number(unit) * qty;
  // Delivery fee must be known before the order can be placed — it is added
  // to the Pathao amount_to_collect so we receive the full amount on delivery.
  const grandTotal = deliveryFee !== null ? subtotal + deliveryFee : null;
  const deliveryReady = deliveryFee !== null; // city + zone selected and fee fetched

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (outOfStock) { toast.error("This item is out of stock."); return; }
    if (!cityId || !zoneId) { toast.error("Select your city and zone to calculate delivery."); return; }
    if (deliveryFee === null) { toast.error("Waiting for delivery fee — please try again in a moment."); return; }
    setSubmitting(true);
    try {
      const res = await submitOrder({
        data: {
          productId: product.id,
          productName: product.name,
          color: color || null,
          size: size || null,
          quantity: qty,
          unitPrice: Number(unit),
          customerName: form.name,
          customerPhone: form.phone,
          customerAddress: form.address,
          cityId, zoneId, areaId,
          specialInstruction: form.instruction || null,
          weight: Number(product.weight) || 0.5,
          deliveryFee: deliveryFee,
          company: form.company,
        },
      });
      if ((res as { warning?: string }).warning) toast.warning((res as { warning: string }).warning);
      else toast.success("Order placed! We'll contact you shortly.");
      navigate({ to: "/order-confirmed", search: { id: (res as { orderId: string }).orderId } });
    } catch (err) {
      toast.error(`Order failed: ${String(err)}`);
    } finally { setSubmitting(false); }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <SiteNav />
      <div className="container mx-auto px-6 py-10 grid md:grid-cols-[1fr,360px] gap-10 flex-1">
        <form onSubmit={submit} className="space-y-6">
          <Link to="/product/$id" params={{ id: product.id }} className="text-sm text-muted-foreground">← Back</Link>
          <h1 className="text-3xl font-display">Checkout</h1>

          {/* Honeypot: hidden from real users, simple bots fill every field they find */}
          <div className="absolute -left-[9999px]" aria-hidden="true">
            <label htmlFor="company">Company</label>
            <input id="company" name="company" type="text" tabIndex={-1} autoComplete="off" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
          </div>

          {!pathaoUp && <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">Delivery service is offline — please try again later, or use WhatsApp from the product page.</div>}

          <div className="grid sm:grid-cols-2 gap-4">
            <div><Label>Full name</Label><Input required minLength={2} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>Phone</Label><Input required minLength={10} maxLength={15} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="98XXXXXXXX" /></div>
          </div>
          <div><Label>Address</Label><Textarea required minLength={5} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>

          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <Label>City</Label>
              <Select value={cityId?.toString() ?? ""} onValueChange={(v) => setCityId(Number(v))}>
                <SelectTrigger><SelectValue placeholder="Select city" /></SelectTrigger>
                <SelectContent>{cities.map((c) => <SelectItem key={c.city_id} value={c.city_id.toString()}>{c.city_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Zone</Label>
              <Select value={zoneId?.toString() ?? ""} onValueChange={(v) => setZoneId(Number(v))} disabled={!cityId}>
                <SelectTrigger><SelectValue placeholder="Select zone" /></SelectTrigger>
                <SelectContent>{zones.map((z) => <SelectItem key={z.zone_id} value={z.zone_id.toString()}>{z.zone_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Area (optional)</Label>
              <Select value={areaId?.toString() ?? ""} onValueChange={(v) => setAreaId(Number(v))} disabled={!zoneId}>
                <SelectTrigger><SelectValue placeholder="Select area" /></SelectTrigger>
                <SelectContent>{areas.map((a) => <SelectItem key={a.area_id} value={a.area_id.toString()}>{a.area_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          <div><Label>Special instructions (optional)</Label><Textarea value={form.instruction} onChange={(e) => setForm({ ...form, instruction: e.target.value })} /></div>

          {outOfStock && <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">This item just sold out — sorry! Please go back and pick a different item or color.</div>}

          <Button size="lg" className="w-full" disabled={submitting || outOfStock || !deliveryReady}>
            {outOfStock
              ? "Out of stock"
              : submitting
              ? "Placing order…"
              : !deliveryReady
              ? "Select city & zone to continue"
              : `Place order — NRS ${grandTotal} (Cash on delivery)`}
          </Button>
          <p className="text-xs text-muted-foreground">No account required. You'll get a call to confirm.</p>
        </form>

        <aside className="border rounded-lg p-5 h-fit bg-card">
          <h3 className="font-medium">{product.name}</h3>
          {color && <p className="text-sm text-muted-foreground">Color: {color}</p>}
          {size && <p className="text-sm text-muted-foreground">Size: {size}</p>}
          <div className="mt-4 flex items-center justify-between text-sm">
            <span>Quantity</span>
            <div className="flex items-center gap-2">
              <Button type="button" size="sm" variant="outline" disabled={outOfStock} onClick={() => setQty(Math.max(1, qty - 1))}>−</Button>
              <span className="w-6 text-center">{qty}</span>
              <Button type="button" size="sm" variant="outline" disabled={outOfStock || (availableStock !== null && qty >= availableStock)} onClick={() => setQty(qty + 1)}>+</Button>
            </div>
          </div>
          {availableStock !== null && availableStock > 0 && availableStock <= 5 && (
            <p className="text-xs text-amber-600 mt-1">Only {availableStock} in stock</p>
          )}
          <div className="border-t mt-4 pt-4 flex justify-between text-sm"><span>Subtotal</span><span>NRS {subtotal}</span></div>
          <div className="flex justify-between text-sm mt-1">
            <span className="text-muted-foreground">Delivery</span>
            {deliveryFeeLoading ? (
              <span className="text-muted-foreground">Calculating…</span>
            ) : deliveryFee !== null ? (
              <span>NRS {deliveryFee}</span>
            ) : (
              <span className="text-muted-foreground text-xs">Select city &amp; zone</span>
            )}
          </div>
          {grandTotal !== null && (
            <div className="border-t mt-3 pt-3 flex justify-between font-semibold">
              <span>Total</span>
              <span>NRS {grandTotal}</span>
            </div>
          )}
          <div className="text-xs text-muted-foreground mt-2">
            {grandTotal !== null
              ? `Cash on delivery — you pay NRS ${grandTotal} when your order arrives.`
              : "Select your city and zone to see the delivery fee and total."}
          </div>
        </aside>
      </div>
      <SiteFooter />
    </div>
  );
}
