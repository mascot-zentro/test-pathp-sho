import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { slugify } from "@/lib/slugify";
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
import { getCities, getZones, getAreas, createOrder, getDeliveryEstimate, previewPromoCode } from "@/lib/pathao.functions";

export const Route = createFileRoute("/checkout/$productId")({
  validateSearch: z.object({ color: z.string().optional(), size: z.string().optional() }).parse,
  component: Checkout,
});

type Product = { id: string; name: string; price: number; sale_price: number | null; on_sale: boolean; weight: number; image_url: string | null };

function Checkout() {
  const { productId } = Route.useParams();
  const { color, size } = Route.useSearch();
  const navigate = useNavigate();
  const [product, setProduct] = useState<Product | null>(null);
  const [qty, setQty] = useState(1);
  const [availableStock, setAvailableStock] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", address: "", instruction: "" });
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
  const [deliveryError, setDeliveryError] = useState<"not_configured" | "unavailable" | null>(null);
  const [promoInput, setPromoInput] = useState("");
  const [promo, setPromo] = useState<{ code: string; discountPercent: number } | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [promoChecking, setPromoChecking] = useState(false);
  const [vatEnabled, setVatEnabled] = useState(false);
  const [vatPct, setVatPct] = useState(13);

  const checkPromo = useServerFn(previewPromoCode);

  const fetchCities = useServerFn(getCities);
  const fetchZones = useServerFn(getZones);
  const fetchAreas = useServerFn(getAreas);
  const submitOrder = useServerFn(createOrder);
  const fetchDeliveryEstimate = useServerFn(getDeliveryEstimate);

  useEffect(() => {
    supabase.from("app_settings").select("key,value").in("key", ["vat_enabled", "vat_percentage"]).then(({ data }) => {
      const m: Record<string, string> = {};
      (data ?? []).forEach((r: { key: string; value: string | null }) => { if (r.value) m[r.key] = r.value; });
      setVatEnabled(m.vat_enabled === "true");
      if (m.vat_percentage) setVatPct(Number(m.vat_percentage));
    });
    supabase.from("products").select("id,name,price,sale_price,on_sale,weight,image_url").eq("id", productId).maybeSingle()
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
    const load = async () => {
      if (!size) {
        const { data } = await supabase.from("products").select("stock_quantity").eq("id", productId).maybeSingle();
        setAvailableStock((data as { stock_quantity: number | null } | null)?.stock_quantity ?? null);
        return;
      }
      const { data } = await supabase.from("product_sizes").select("stock_quantity").eq("product_id", productId).eq("name", size).maybeSingle();
      const qty = (data as { stock_quantity: number | null } | null)?.stock_quantity;
      setAvailableStock(qty !== undefined && qty !== null ? qty : null);
    };
    load();
  }, [productId, size]);

  useEffect(() => {
    if (availableStock !== null && qty > availableStock) setQty(Math.max(1, availableStock));
  }, [availableStock, qty]);

  useEffect(() => {
    if (!cityId || !zoneId || !product) { setDeliveryFee(null); setDeliveryError(null); return; }
    setDeliveryFeeLoading(true);
    setDeliveryError(null);
    fetchDeliveryEstimate({ data: { cityId, zoneId, weight: Number(product.weight) || 0.5 } })
      .then((res: unknown) => {
        const r = res as { ok: boolean; fee?: number; reason?: "not_configured" | "unavailable" };
        if (r?.ok && typeof r.fee === "number") { setDeliveryFee(r.fee); setDeliveryError(null); }
        else { setDeliveryFee(null); setDeliveryError(r?.reason ?? "unavailable"); }
      })
      .catch(() => { setDeliveryFee(null); setDeliveryError("unavailable"); })
      .finally(() => setDeliveryFeeLoading(false));
  }, [cityId, zoneId, product, fetchDeliveryEstimate]);

  if (!product) return <div className="min-h-screen"><SiteNav /><div className="container mx-auto px-6 py-20 text-muted-foreground">Loading…</div></div>;

  const outOfStock = availableStock === 0;
  const unit = product.on_sale && product.sale_price ? product.sale_price : product.price;
  const subtotal = Number(unit) * qty;
  const discountAmount = promo ? Math.round(subtotal * (promo.discountPercent / 100) * 100) / 100 : 0;
  const discountedSubtotal = subtotal - discountAmount;
  const vatAmount = vatEnabled ? Math.round(discountedSubtotal * (vatPct / 100) * 100) / 100 : 0;
  const subtotalWithVat = discountedSubtotal + vatAmount;
  // Delivery fee must be known before the order can be placed — it is added
  // to the Pathao amount_to_collect so we receive the full amount on delivery.
  const grandTotal = deliveryFee !== null ? subtotalWithVat + deliveryFee : null;
  const deliveryReady = deliveryFee !== null; // city + zone selected and fee fetched

  const applyPromo = async () => {
    if (!promoInput.trim()) return;
    setPromoChecking(true);
    setPromoError(null);
    try {
      const res = (await checkPromo({ data: { code: promoInput.trim() } })) as { valid: boolean; discountPercent?: number; message?: string };
      if (res.valid && res.discountPercent) {
        setPromo({ code: promoInput.trim().toUpperCase(), discountPercent: res.discountPercent });
        toast.success(`Promo applied: ${res.discountPercent}% off`);
      } else {
        setPromo(null);
        setPromoError(res.message ?? "Invalid promo code.");
      }
    } catch (err) {
      const msg = String(err);
      if (msg.toLowerCase().includes("too many")) {
        toast.error("Too many attempts — please wait a moment before trying again.");
      } else {
        setPromoError("Couldn't check that code, try again.");
      }
    } finally {
      setPromoChecking(false);
    }
  };

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
          promoCode: promo?.code ?? null,
        },
      });
      if ((res as { warning?: string }).warning) toast.warning((res as { warning: string }).warning);
      else toast.success("Order placed! We'll contact you shortly.");
      navigate({ to: "/order-confirmed", search: { id: (res as { orderId: string }).orderId } });
    } catch (err) {
      const msg = String(err);
      if (msg.toLowerCase().includes("too many")) {
        toast.error("Too many orders submitted — please wait a few minutes and try again.", { duration: 6000 });
      } else if (msg.toLowerCase().includes("stock")) {
        toast.error("Sorry, this item just went out of stock.");
      } else {
        toast.error("Order failed. Please check your details and try again.");
      }
    } finally { setSubmitting(false); }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <SiteNav />
      <div className="container mx-auto px-6 py-10 grid md:grid-cols-[1fr,360px] gap-10 flex-1 items-start">
        <form onSubmit={submit} className="space-y-6">
          <Link to="/product/$slug" params={{ slug: slugify(product.name) }} className="text-sm text-muted-foreground">← Back</Link>
          <h1 className="text-3xl font-display">Checkout</h1>

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
              : deliveryError
              ? "Delivery unavailable — see below"
              : !deliveryReady
              ? "Select city & zone to continue"
              : `Place order — NRS ${grandTotal}`}
          </Button>
          {deliveryError && (
            <p className="text-sm text-destructive">
              {deliveryError === "not_configured"
                ? "Online checkout isn't set up for delivery pricing yet."
                : "Couldn't calculate the delivery fee for this area right now."}{" "}
              Please message us on WhatsApp from the product page to place this order instead.
            </p>
          )}
          <p className="text-xs text-muted-foreground">No account required. You'll get a call to confirm.</p>
          <p className="text-xs text-muted-foreground">
            By placing this order, you agree to our{" "}
            <Link to="/terms" target="_blank" className="text-accent hover:underline">Terms &amp; Conditions</Link>.
          </p>
        </form>

        <aside className="border rounded-lg p-5 h-fit bg-card md:order-last">
          <div className="flex items-start gap-3">
            {product.image_url && (
              <img
                src={product.image_url ?? ""}
                alt={product.name}
                className="w-14 h-14 rounded-md object-cover shrink-0"
              />
            )}
            <div className="min-w-0">
          <h3 className="font-medium leading-snug">{product.name}</h3>
          {color && <p className="text-sm text-muted-foreground">Color: {color}</p>}
          {size && <p className="text-sm text-muted-foreground">Size: {size}</p>}
            </div>
          </div>
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
          <div className="border-t mt-4 pt-4">
            <Label className="text-xs">Promo code</Label>
            <div className="flex gap-2 mt-1">
              <Input value={promoInput} onChange={(e) => setPromoInput(e.target.value)} placeholder="e.g. WELCOME10" disabled={!!promo} className="text-sm" />
              {promo ? (
                <Button type="button" size="sm" variant="outline" onClick={() => { setPromo(null); setPromoInput(""); setPromoError(null); }}>Remove</Button>
              ) : (
                <Button type="button" size="sm" variant="outline" disabled={promoChecking || !promoInput.trim()} onClick={applyPromo}>{promoChecking ? "Checking…" : "Apply"}</Button>
              )}
            </div>
            {promoError && <p className="text-xs text-destructive mt-1">{promoError}</p>}
            {promo && <p className="text-xs text-emerald-600 mt-1">"{promo.code}" applied — {promo.discountPercent}% off</p>}
          </div>
          <div className="mt-3 flex justify-between text-sm"><span>Subtotal</span><span>NRS {subtotal}</span></div>
          {discountAmount > 0 && (
            <div className="flex justify-between text-sm text-emerald-600"><span>Discount</span><span>− NRS {discountAmount}</span></div>
          )}
          {vatEnabled && vatAmount > 0 && (
            <div className="flex justify-between text-sm text-muted-foreground"><span>VAT ({vatPct}%)</span><span>NRS {vatAmount}</span></div>
          )}
          <div className="flex justify-between text-sm mt-1">
            <span className="text-muted-foreground">Delivery</span>
            {deliveryFeeLoading ? (
              <span className="text-muted-foreground">Calculating…</span>
            ) : deliveryFee !== null ? (
              <span>NRS {deliveryFee}</span>
            ) : deliveryError ? (
              <span className="text-destructive text-xs">Unavailable</span>
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
              ? `Cash on delivery — you pay NRS ${grandTotal} when your order arrives.${vatEnabled ? ` (incl. ${vatPct}% VAT on products)` : ""}`
              : "Select your city and zone to see the delivery fee and total."}
          </div>
        </aside>
      </div>
      <SiteFooter />
    </div>
  );
}
