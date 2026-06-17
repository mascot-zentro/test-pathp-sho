import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getCities = createServerFn({ method: "GET" }).handler(async () => {
  const { pathao } = await import("./pathao.server");
  try { return await pathao.cities(); } catch (e) { return { error: String(e) }; }
});

export const getZones = createServerFn({ method: "POST" })
  .inputValidator(z.object({ cityId: z.number() }))
  .handler(async ({ data }) => {
    const { pathao } = await import("./pathao.server");
    try { return await pathao.zones(data.cityId); } catch (e) { return { error: String(e) }; }
  });

export const getAreas = createServerFn({ method: "POST" })
  .inputValidator(z.object({ zoneId: z.number() }))
  .handler(async ({ data }) => {
    const { pathao } = await import("./pathao.server");
    try { return await pathao.areas(data.zoneId); } catch (e) { return { error: String(e) }; }
  });

export const getPathaoStores = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: roles } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId).eq("role", "admin");
    if (!roles || roles.length === 0) throw new Error("Forbidden");
    const { pathao } = await import("./pathao.server");
    try { return await pathao.stores(); } catch (e) { return { error: String(e) }; }
  });

const orderSchema = z.object({
  productId: z.string().uuid().nullable(),
  productName: z.string().min(1),
  color: z.string().nullable(),
  size: z.string().nullable(),
  quantity: z.number().int().min(1),
  unitPrice: z.number().min(0),
  customerName: z.string().min(2).max(100),
  customerPhone: z.string().min(10).max(15),
  customerAddress: z.string().min(5).max(220),
  cityId: z.number().int(),
  zoneId: z.number().int(),
  areaId: z.number().int().optional().nullable(),
  specialInstruction: z.string().optional().nullable(),
  weight: z.number().min(0.5).max(10).default(0.5),
});

export const createOrder = createServerFn({ method: "POST" })
  .inputValidator(orderSchema)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const total = data.unitPrice * data.quantity;

    // Atomically check & reserve stock first. If this product/color/size tracks
    // stock and there isn't enough left, this fails and no order is created.
    if (data.productId) {
      const { data: stockOk, error: stockErr } = await supabaseAdmin.rpc("decrement_stock", {
        p_product_id: data.productId,
        p_color: data.color,
        p_size: data.size,
        p_quantity: data.quantity,
      });
      if (stockErr) throw new Error(stockErr.message);
      if (!stockOk) throw new Error("Sorry, this item just went out of stock.");
    }

    // Insert order first
    const { data: order, error: orderErr } = await supabaseAdmin
      .from("orders")
      .insert({
        product_id: data.productId,
        product_name: data.productName,
        color: data.color,
        size: data.size,
        quantity: data.quantity,
        unit_price: data.unitPrice,
        total,
        customer_name: data.customerName,
        customer_phone: data.customerPhone,
        customer_address: data.customerAddress,
        recipient_city: data.cityId,
        recipient_zone: data.zoneId,
        recipient_area: data.areaId ?? null,
        special_instruction: data.specialInstruction ?? null,
        status: "pending",
      })
      .select()
      .single();
    if (orderErr || !order) throw new Error(orderErr?.message ?? "Order insert failed");

    // Get pathao store_id from settings
    const { data: setting } = await supabaseAdmin.from("app_settings").select("value").eq("key", "pathao_store_id").maybeSingle();
    const storeId = setting?.value ? Number(setting.value) : null;

    if (!storeId) {
      await supabaseAdmin.from("orders").update({ status: "awaiting_pathao_config" }).eq("id", order.id);
      return { orderId: order.id, pathao: null, warning: "Pathao store_id not configured in admin settings" };
    }

    const variantLabel = [data.color, data.size].filter(Boolean).join(", ");
    try {
      const { pathao } = await import("./pathao.server");
      const pathaoRes = await pathao.createOrder({
        store_id: storeId,
        merchant_order_id: order.id,
        recipient_name: data.customerName,
        recipient_phone: data.customerPhone,
        recipient_address: data.customerAddress,
        recipient_city: data.cityId,
        recipient_zone: data.zoneId,
        ...(data.areaId ? { recipient_area: data.areaId } : {}),
        delivery_type: 48,
        item_type: 2,
        special_instruction: data.specialInstruction ?? "",
        item_quantity: data.quantity,
        item_weight: data.weight,
        item_description: `${data.productName}${variantLabel ? ` (${variantLabel})` : ""}`,
        amount_to_collect: Math.round(total),
      }) as { data?: { consignment_id?: string } };

      await supabaseAdmin.from("orders").update({
        pathao_consignment_id: pathaoRes?.data?.consignment_id ?? null,
        pathao_response: pathaoRes as never,
        status: "submitted",
      }).eq("id", order.id);
      return { orderId: order.id, pathao: pathaoRes };
    } catch (e) {
      await supabaseAdmin.from("orders").update({ status: "pathao_failed", pathao_response: { error: String(e) } as never }).eq("id", order.id);
      return { orderId: order.id, pathao: null, warning: `Order saved, Pathao failed: ${String(e)}` };
    }
  });
