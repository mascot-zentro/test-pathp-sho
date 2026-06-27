import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCart } from "@/lib/cart";
import { getCities, getZones, getAreas, getDeliveryEstimate, createCartOrder, previewPromoCode } from "@/lib/pathao.functions";
import { getSavedAddress, saveAddress, type SavedAddress } from "@/lib/saved-address";

export const Route = createFileRoute("/cart")({
  component: CartPage,
});

function CartPage() {
  const navigate = useNavigate();
  const { items, updateQty, removeItem, subtotal, clear } = useCart();
  const [form, setForm] = useState({ name: "", phone: "", address: "", instruction: "" });
  const [cities, setCities] = useState<{ city_id: number; city_name: string }[]>([]);
  const [zones, setZones] = useState<{ zone_id: number; zone_name: string }[]>([]);
  const [areas, setAreas] = useState<{ area_id: number; area_name: string }[]>([]);
  const [cityId, setCityId] = useState<number | null>(null);
  const [cityName, setCityName] = useState("");
  const [zoneId, setZoneId] = useState<number | null>(null);
  const [zoneName, setZoneName] = useState("");
  const [areaId, setAreaId] = useState<number | null>(null);
  const [areaName, setAreaName] = useState<string | null>(null);
  const [savedAddress, setSavedAddress] = useState<SavedAddress | null>(null);
  const [savedApplied, setSavedApplied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pathaoUp, setPathaoUp] = useState(true);
  const [deliveryFee, setDeliveryFee] = useState<number | null>(null);
  const [deliveryFeeLoading, setDeliveryFeeLoading] = useState(false);
  const [deliveryError, setDeliveryError] = useState<"not_configured" | "unavailable" | null>(null);
  const [promoInput, setPromoInput] = useState("");
  const [promo, setPromo] = useState<{ code: string; discountPercent: number } | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [promoChecking, setPromoChecking] = useState(false);

  const fetchCities = useServerFn(getCities);
  const fetchZones = useServerFn(getZones);
  const fetchAreas = useServerFn(getAreas);
  const fetchDeliveryEstimate = useServerFn(getDeliveryEstimate);
  const checkPromo = useServerFn(previewPromoCode);
  const submitOrder = useServerFn(createCartOrder);

  const totalWeight = items.reduce((s, i) => s + i.weight * i.quantity, 0);

  useEffect(() => {
    const saved = getSavedAddress();
    if (saved) setSavedAddress(saved);
  }, []);

  useEffect(() => {
    fetchCities().then((res: unknown) => {
      const r = res as { data?: { data?: { city_id: number; city_name: string }[] } };
      const list = r?.data?.data;
      if (Array.isArray(list)) {
        setCities(list);
        // Auto-apply saved address once cities are available
        const saved = getSavedAddress();
        if (saved && !savedApplied) {
          setForm((f) => ({ ...f, name: saved.name, phone: saved.phone, address: saved.address }));
          setCityId(saved.cityId);
          setCityName(saved.cityName);
          setSavedApplied(true);
        }
      } else setPathaoUp(false);
    }).catch(() => setPathaoUp(false));
  }, [fetchCities]);

  useEffect(() => {
    if (!cityId) return;
    setZones([]); setAreas([]); setZoneId(null); setAreaId(null); setZoneName(""); setAreaName(null);
    fetchZones({ data: { cityId } }).then((res: unknown) => {
      const r = res as { data?: { data?: { zone_id: number; zone_name: string }[] } };
      const list = r?.data?.data;
      if (Array.isArray(list)) {
        setZones(list);
        const saved = getSavedAddress();
        if (saved && saved.cityId === cityId && !zoneId && list.some((z) => z.zone_id === saved.zoneId)) {
          setZoneId(saved.zoneId);
          setZoneName(saved.zoneName);
        }
      }
    });
  }, [cityId, fetchZones]);

  useEffect(() => {
    if (!zoneId) return;
    setAreas([]); setAreaId(null); setAreaName(null);
    fetchAreas({ data: { zoneId } }).then((res: unknown) => {
      const r = res as { data?: { data?: { area_id: number; area_name: string }[] } };
      const list = r?.data?.data;
      if (Array.isArray(list)) {
        setAreas(list);
        const saved = getSavedAddress();
        if (saved && saved.zoneId === zoneId && saved.areaId && !areaId) {
          setAreaId(saved.areaId);
          setAreaName(saved.areaName);
        }
      }
    });
  }, [zoneId, fetchAreas]);

  useEffect(() => {
    if (!cityId || !zoneId || items.length === 0) { setDeliveryFee(null); setDeliveryError(null); return; }
    setDeliveryFeeLoading(true);
    setDeliveryError(null);
    fetchDeliveryEstimate({ data: { cityId, zoneId, weight: Math.min(10, Math.max(0.5, totalWeight)) } })
      .then((res: unknown) => {
        // getDeliveryEstimate returns { ok: true, fee } or { ok: false, reason },
        // never a bare number — this used to check `typeof fee === "number"`
        // against the whole response object, which is always false, so the
        // delivery fee silently stayed null even when Pathao succeeded.
        const r = res as { ok: boolean; fee?: number; reason?: "not_configured" | "unavailable" };
        if (r?.ok && typeof r.fee === "number") { setDeliveryFee(r.fee); setDeliveryError(null); }
        else { setDeliveryFee(null); setDeliveryError(r?.reason ?? "unavailable"); }
      })
      .catch(() => { setDeliveryFee(null); setDeliveryError("unavailable"); })
      .finally(() => setDeliveryFeeLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cityId, zoneId, items.length, fetchDeliveryEstimate]);

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
    } catch {
      setPromoError("Couldn't check that code, try again.");
    } finally {
      setPromoChecking(false);
    }
  };

  const discountAmount = promo ? Math.round(subtotal * (promo.discountPercent / 100) * 100) / 100 : 0;
  const discountedSubtotal = subtotal - discountAmount;
  const grandTotal = deliveryFee !== null ? discountedSubtotal + deliveryFee : null;
  const deliveryReady = deliveryFee !== null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0) return;
    if (!cityId || !zoneId) { toast.error("Select your city and zone to calculate delivery."); return; }
    if (deliveryFee === null) { toast.error("Waiting for delivery fee — please try again in a moment."); return; }
    setSubmitting(true);
    try {
      const res = await submitOrder({
        data: {
          items: items.map((i) => ({
            productId: i.productId,
            productName: i.productName,
            color: i.color,
            size: i.size,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            weight: i.weight,
          })),
          customerName: form.name,
          customerPhone: form.phone,
          customerAddress: form.address,
          cityId, zoneId, areaId,
          specialInstruction: form.instruction || null,
          deliveryFee,
          promoCode: promo?.code ?? null,
        },
      });
      if ((res as { warning?: string }).warning) toast.warning((res as { warning: string }).warning);
      else toast.success("Order placed! We'll contact you shortly.");
      // Persist delivery details for next visit
      if (cityId && zoneId) {
        saveAddress({
          name: form.name,
          phone: form.phone,
          address: form.address,
          cityId,
          cityName,
          zoneId,
          zoneName,
          areaId,
          areaName,
        });
      }
      clear();
      const ids = (res as { orderIds?: string[] }).orderIds ?? [];
      navigate({ to: "/order-confirmed", search: { id: ids[0] ?? "" } });
    } catch (err) {
      toast.error(`Order failed: ${String(err)}`);
    } finally { setSubmitting(false); }
  };

  if (items.length === 0) {
    return (
      <div className="min-h-screen flex flex-col">
        <SiteNav />
        <div className="container mx-auto px-6 py-20 text-center flex-1">
          <h1 className="text-2xl font-display mb-2">Your cart is empty</h1>
          <p className="text-muted-foreground mb-6">Add something you like, then come back here to check out.</p>
          <Link to="/"><Button>Continue shopping</Button></Link>
        </div>
        <SiteFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <SiteNav />
      <div className="container mx-auto px-6 py-10 grid md:grid-cols-[1fr,380px] gap-10 flex-1">
        <div className="space-y-6">
          <h1 className="text-3xl font-display">Your cart</h1>
          <div className="divide-y border rounded-lg">
            {items.map((i) => (
              <div key={i.key} className="p-4 flex items-center gap-4">
                <div className="size-16 rounded-md bg-muted overflow-hidden shrink-0">
                  {i.image && <img src={i.image} alt={i.productName} loading="lazy" decoding="async" className="w-full h-full object-cover" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{i.productName}</div>
                  <div className="text-xs text-muted-foreground">{[i.color, i.size].filter(Boolean).join(" · ")}</div>
                  <div className="text-sm mt-1">NRS {i.unitPrice}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => updateQty(i.key, i.quantity - 1)}>−</Button>
                  <span className="w-6 text-center text-sm">{i.quantity}</span>
                  <Button type="button" size="sm" variant="outline" onClick={() => updateQty(i.key, i.quantity + 1)}>+</Button>
                </div>
                <button type="button" onClick={() => removeItem(i.key)} className="text-muted-foreground hover:text-destructive" aria-label="Remove">
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-6">
            <h2 className="text-xl font-display">Delivery details</h2>

            {savedAddress && (
              <div className="rounded-xl border border-accent/30 bg-accent/5 px-4 py-3 flex items-start justify-between gap-3">
                <div className="text-sm leading-relaxed">
                  <p className="font-medium text-accent text-xs tracking-wide uppercase mb-1">Saved address</p>
                  <p className="font-medium">{savedAddress.name} · {savedAddress.phone}</p>
                  <p className="text-muted-foreground text-xs mt-0.5">{savedAddress.address} · {savedAddress.cityName}{savedAddress.zoneName ? `, ${savedAddress.zoneName}` : ""}{savedAddress.areaName ? `, ${savedAddress.areaName}` : ""}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSavedAddress(null);
                    setForm((f) => ({ ...f, name: "", phone: "", address: "" }));
                    setCityId(null); setZoneId(null); setAreaId(null);
                    setCityName(""); setZoneName(""); setAreaName(null);
                    import("@/lib/saved-address").then((m) => m.clearSavedAddress());
                  }}
                  className="text-xs text-muted-foreground hover:text-destructive transition-colors shrink-0 mt-0.5"
                >
                  Clear
                </button>
              </div>
            )}

            {!pathaoUp && <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">Delivery service is offline — please try again later.</div>}

            <div className="grid sm:grid-cols-2 gap-4">
              <div><Label>Full name</Label><Input required minLength={2} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div><Label>Phone</Label><Input required minLength={10} maxLength={15} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="98XXXXXXXX" /></div>
            </div>
            <div><Label>Address</Label><Textarea required minLength={5} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>

            <div className="grid sm:grid-cols-3 gap-4">
              <div>
                <Label>City</Label>
                <Select value={cityId?.toString() ?? ""} onValueChange={(v) => {
                  const id = Number(v);
                  setCityId(id);
                  setCityName(cities.find((c) => c.city_id === id)?.city_name ?? "");
                }}>
                  <SelectTrigger><SelectValue placeholder="Select city" /></SelectTrigger>
                  <SelectContent>{cities.map((c) => <SelectItem key={c.city_id} value={c.city_id.toString()}>{c.city_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Zone</Label>
                <Select value={zoneId?.toString() ?? ""} onValueChange={(v) => {
                  const id = Number(v);
                  setZoneId(id);
                  setZoneName(zones.find((z) => z.zone_id === id)?.zone_name ?? "");
                }} disabled={!cityId}>
                  <SelectTrigger><SelectValue placeholder="Select zone" /></SelectTrigger>
                  <SelectContent>{zones.map((z) => <SelectItem key={z.zone_id} value={z.zone_id.toString()}>{z.zone_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Area (optional)</Label>
                <Select value={areaId?.toString() ?? ""} onValueChange={(v) => {
                  const id = Number(v);
                  setAreaId(id);
                  setAreaName(areas.find((a) => a.area_id === id)?.area_name ?? null);
                }} disabled={!zoneId}>
                  <SelectTrigger><SelectValue placeholder="Select area" /></SelectTrigger>
                  <SelectContent>{areas.map((a) => <SelectItem key={a.area_id} value={a.area_id.toString()}>{a.area_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            <div><Label>Special instructions (optional)</Label><Textarea value={form.instruction} onChange={(e) => setForm({ ...form, instruction: e.target.value })} /></div>

            <Button size="lg" className="w-full" disabled={submitting || !deliveryReady}>
              {submitting
                ? "Placing order…"
                : deliveryError
                ? "Delivery unavailable — see below"
                : !deliveryReady
                ? "Select city & zone to continue"
                : `Place order — NRS ${grandTotal} (Cash on delivery)`}
            </Button>
            {deliveryError && (
              <p className="text-sm text-destructive">
                {deliveryError === "not_configured"
                  ? "Online checkout isn't set up for delivery pricing yet."
                  : "Couldn't calculate the delivery fee for this area right now."}{" "}
                Please message us on WhatsApp to place this order instead.
              </p>
            )}
            <p className="text-xs text-muted-foreground">No account required. You'll get a call to confirm.</p>
          </form>
        </div>

        <aside className="border rounded-lg p-5 h-fit bg-card">
          <h3 className="font-medium mb-3">Order summary</h3>

          <div>
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

          <div className="mt-4 flex justify-between text-sm"><span>Subtotal</span><span>NRS {subtotal}</span></div>
          {discountAmount > 0 && (
            <div className="flex justify-between text-sm text-emerald-600"><span>Discount</span><span>− NRS {discountAmount}</span></div>
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
              ? `Cash on delivery — you pay NRS ${grandTotal} when your order arrives.`
              : "Select your city and zone to see the delivery fee and total."}
          </div>
        </aside>
      </div>
      <SiteFooter />
    </div>
  );
}
