import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getCities, getZones, getAreas, getDeliveryEstimate, createManualOrder } from "@/lib/pathao.functions";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus } from "lucide-react";
import { ORDER_SOURCES } from "@/lib/admin-types";

type Product = { id: string; name: string; price: number; sale_price: number | null; on_sale: boolean; weight: number };

const EMPTY_FORM = {
  productId: "" as string,
  productName: "",
  color: "",
  size: "",
  quantity: 1,
  unitPrice: "" as string | number,
  weight: 0.5,
  customerName: "",
  customerPhone: "",
  customerAddress: "",
  specialInstruction: "",
  source: "instagram" as "instagram" | "tiktok" | "facebook" | "whatsapp" | "manual",
};

export function AddOrderDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);

  const [cities, setCities] = useState<{ city_id: number; city_name: string }[]>([]);
  const [zones, setZones] = useState<{ zone_id: number; zone_name: string }[]>([]);
  const [areas, setAreas] = useState<{ area_id: number; area_name: string }[]>([]);
  const [cityId, setCityId] = useState<number | null>(null);
  const [zoneId, setZoneId] = useState<number | null>(null);
  const [areaId, setAreaId] = useState<number | null>(null);
  const [deliveryFee, setDeliveryFee] = useState<number | null>(null);
  const [deliveryFeeLoading, setDeliveryFeeLoading] = useState(false);
  const [skipPathao, setSkipPathao] = useState(false);

  const fetchCities = useServerFn(getCities);
  const fetchZones = useServerFn(getZones);
  const fetchAreas = useServerFn(getAreas);
  const fetchDeliveryEstimate = useServerFn(getDeliveryEstimate);
  const submitOrder = useServerFn(createManualOrder);

  useEffect(() => {
    if (!open) return;
    supabase.from("products").select("id,name,price,sale_price,on_sale,weight").eq("active", true).order("name")
      .then(({ data }) => setProducts((data as Product[]) ?? []));
    fetchCities().then((res: unknown) => {
      const r = res as { data?: { data?: { city_id: number; city_name: string }[] } };
      if (Array.isArray(r?.data?.data)) setCities(r.data.data);
    });
  }, [open, fetchCities]);

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
    if (!cityId || !zoneId) { setDeliveryFee(null); return; }
    setDeliveryFeeLoading(true);
    fetchDeliveryEstimate({ data: { cityId, zoneId, weight: Number(form.weight) || 0.5 } })
      .then((res: unknown) => {
        const r = res as { ok: boolean; fee?: number };
        setDeliveryFee(r?.ok ? r.fee ?? null : null);
      })
      .catch(() => setDeliveryFee(null))
      .finally(() => setDeliveryFeeLoading(false));
  }, [cityId, zoneId, form.weight, fetchDeliveryEstimate]);

  const selectProduct = (id: string) => {
    const p = products.find((x) => x.id === id);
    if (!p) return;
    const price = p.on_sale && p.sale_price ? p.sale_price : p.price;
    setForm((f) => ({ ...f, productId: p.id, productName: p.name, unitPrice: price, weight: Number(p.weight) || 0.5 }));
  };

  const reset = () => {
    setForm(EMPTY_FORM);
    setCityId(null); setZoneId(null); setAreaId(null);
    setDeliveryFee(null); setSkipPathao(false);
  };

  const subtotal = (Number(form.unitPrice) || 0) * form.quantity;
  const total = subtotal + (deliveryFee ?? 0);

  const handleSubmit = async () => {
    if (!form.productName.trim()) { toast.error("Enter a product name."); return; }
    if (!form.unitPrice || Number(form.unitPrice) < 0) { toast.error("Enter a valid price."); return; }
    if (!form.customerName.trim() || !form.customerPhone.trim() || !form.customerAddress.trim()) {
      toast.error("Customer name, phone, and address are required.");
      return;
    }
    if (!skipPathao && (!cityId || !zoneId)) {
      toast.error("Select city and zone, or check 'Don't send to Pathao' below.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await submitOrder({
        data: {
          productId: form.productId || null,
          productName: form.productName.trim(),
          color: form.color.trim() || null,
          size: form.size.trim() || null,
          quantity: form.quantity,
          unitPrice: Number(form.unitPrice),
          customerName: form.customerName.trim(),
          customerPhone: form.customerPhone.trim(),
          customerAddress: form.customerAddress.trim(),
          cityId: skipPathao ? null : cityId,
          zoneId: skipPathao ? null : zoneId,
          areaId: skipPathao ? null : areaId,
          specialInstruction: form.specialInstruction.trim() || null,
          weight: Number(form.weight) || 0.5,
          deliveryFee: skipPathao ? 0 : (deliveryFee ?? 0),
          source: form.source,
          skipStockCheck: !form.productId,
          skipPathao,
        },
      });
      const r = res as { warning?: string };
      if (r.warning) toast.warning(r.warning);
      else if (skipPathao) toast.success("Order added.");
      else toast.success("Order added and sent to Pathao.");
      reset();
      setOpen(false);
      onCreated();
    } catch (e) {
      toast.error(`Couldn't add order: ${String(e)}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <Button type="button" size="sm" onClick={() => setOpen(true)} className="gap-1.5">
        <Plus className="size-4" /> Add order
      </Button>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add an order</DialogTitle>
          <DialogDescription>
            Log a sale that happened on Instagram, TikTok, or elsewhere — it'll be saved here and sent to
            Pathao for delivery just like a normal order.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div>
            <Label>Where did this sale come from?</Label>
            <Select value={form.source} onValueChange={(v) => setForm((f) => ({ ...f, source: v as typeof f.source }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ORDER_SOURCES.filter((s) => s.value !== "website").map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3 border rounded-lg p-3.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Product</Label>
            {products.length > 0 && (
              <Select value={form.productId} onValueChange={selectProduct}>
                <SelectTrigger><SelectValue placeholder="Pick from catalog (optional)" /></SelectTrigger>
                <SelectContent>
                  {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label>Product name</Label>
                <Input value={form.productName} onChange={(e) => setForm((f) => ({ ...f, productName: e.target.value }))} placeholder="e.g. Dress 1" />
              </div>
              <div>
                <Label>Price per unit (NRS)</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.unitPrice}
                  onChange={(e) => setForm((f) => ({ ...f, unitPrice: e.target.value }))}
                  placeholder="e.g. 1500"
                />
              </div>
              <div>
                <Label>Color (optional)</Label>
                <Input value={form.color} onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))} />
              </div>
              <div>
                <Label>Size (optional)</Label>
                <Input value={form.size} onChange={(e) => setForm((f) => ({ ...f, size: e.target.value }))} />
              </div>
              <div>
                <Label>Quantity</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.quantity}
                  onChange={(e) => setForm((f) => ({ ...f, quantity: Math.max(1, Number(e.target.value) || 1) }))}
                />
              </div>
              <div>
                <Label>Weight (kg, for delivery)</Label>
                <Input
                  type="number"
                  min={0.1}
                  step={0.1}
                  value={form.weight}
                  onChange={(e) => setForm((f) => ({ ...f, weight: Number(e.target.value) || 0.5 }))}
                />
              </div>
            </div>
            {form.productId && (
              <p className="text-xs text-muted-foreground">
                Picked from catalog — stock will be reduced by {form.quantity} when this order is saved.
              </p>
            )}
          </div>

          <div className="space-y-3 border rounded-lg p-3.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Customer</Label>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label>Full name</Label>
                <Input value={form.customerName} onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))} />
              </div>
              <div>
                <Label>Phone</Label>
                <Input value={form.customerPhone} onChange={(e) => setForm((f) => ({ ...f, customerPhone: e.target.value }))} placeholder="98XXXXXXXX" />
              </div>
            </div>
            <div>
              <Label>Delivery address</Label>
              <Textarea value={form.customerAddress} onChange={(e) => setForm((f) => ({ ...f, customerAddress: e.target.value }))} />
            </div>
          </div>

          <div className="space-y-3 border rounded-lg p-3.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Delivery (Pathao)</Label>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                <input type="checkbox" checked={skipPathao} onChange={(e) => setSkipPathao(e.target.checked)} />
                Don't send to Pathao (handled separately)
              </label>
            </div>
            {!skipPathao && (
              <>
                <div className="grid sm:grid-cols-3 gap-3">
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
                <div>
                  <Label>Special instructions (optional)</Label>
                  <Textarea value={form.specialInstruction} onChange={(e) => setForm((f) => ({ ...f, specialInstruction: e.target.value }))} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {deliveryFeeLoading
                    ? "Calculating delivery fee…"
                    : deliveryFee !== null
                    ? `Delivery fee: NRS ${deliveryFee}`
                    : cityId && zoneId
                    ? "Couldn't calculate delivery fee — order will still be saved, but Pathao submission may fail."
                    : "Select city and zone to calculate the delivery fee."}
                </p>
              </>
            )}
          </div>

          <div className="flex justify-between items-center bg-muted/50 rounded-lg px-4 py-3">
            <span className="text-sm text-muted-foreground">
              Subtotal NRS {subtotal}{!skipPathao && deliveryFee !== null ? ` + delivery NRS ${deliveryFee}` : ""}
            </span>
            <span className="font-bold text-lg tabular-nums">NRS {total}</span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" type="button" onClick={() => setOpen(false)} disabled={submitting}>Cancel</Button>
          <Button type="button" onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Saving…" : "Save order"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
