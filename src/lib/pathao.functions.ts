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

// Live delivery-fee quote for the checkout page. Public — no auth needed,
// it's the same information a customer would see before placing the order.
// Reads pathao_store_id from settings server-side so the client never needs
// to know it. Returns null (rather than throwing) on any failure so the
// checkout flow can fall back to "delivery charged by courier on arrival"
// instead of blocking the page.
export const getDeliveryEstimate = createServerFn({ method: "POST" })
  .inputValidator(z.object({ cityId: z.number(), zoneId: z.number(), weight: z.number().min(0.5).max(10) }))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: setting } = await supabaseAdmin.from("app_settings").select("value").eq("key", "pathao_store_id").maybeSingle();
    const storeId = setting?.value ? Number(setting.value) : null;
    if (!storeId) return null;
    const { pathao } = await import("./pathao.server");
    try {
      const res = (await pathao.pricePlan({
        store_id: storeId,
        item_type: 2,
        delivery_type: 48,
        item_weight: data.weight,
        recipient_city: data.cityId,
        recipient_zone: data.zoneId,
      })) as { data?: { final_price?: number } };
      return res?.data?.final_price ?? null;
    } catch {
      return null;
    }
  });

// Pulls the live status from Pathao for one order and stores it in
// orders.pathao_status, separate from the admin's own manual `status`
// workflow field so neither overwrites the other.
export const syncOrderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ orderId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { data: roles } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId).eq("role", "admin");
    if (!roles || roles.length === 0) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: order, error } = await supabaseAdmin.from("orders").select("pathao_consignment_id").eq("id", data.orderId).maybeSingle();
    if (error || !order) throw new Error("Order not found");
    if (!order.pathao_consignment_id) throw new Error("This order has no Pathao consignment yet");
    const { pathao } = await import("./pathao.server");
    const res = (await pathao.orderInfo(order.pathao_consignment_id)) as { data?: { order_status_slug?: string } };
    const slug = res?.data?.order_status_slug ?? null;
    await supabaseAdmin.from("orders").update({ pathao_status: slug }).eq("id", data.orderId);
    return { pathaoStatus: slug };
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
  company: z.string().max(0).optional(), // honeypot — real users never see/fill this field
});

export const createOrder = createServerFn({ method: "POST" })
  .inputValidator(orderSchema)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const total = data.unitPrice * data.quantity;

    // Basic anti-spam: cap how many orders one phone number can place in a
    // short window. Cheapest check first, before touching stock or inserting.
    const RATE_LIMIT_WINDOW_MIN = 10;
    const RATE_LIMIT_MAX_ORDERS = 3;
    const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MIN * 60 * 1000).toISOString();
    const { count: recentCount } = await supabaseAdmin
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("customer_phone", data.customerPhone)
      .gte("created_at", since);
    if ((recentCount ?? 0) >= RATE_LIMIT_MAX_ORDERS) {
      throw new Error("Too many orders from this phone number recently. Please wait a few minutes, or contact us directly if you need to order more.");
    }

    // Atomically check & reserve stock first. If this product/color/size tracks
    // stock and there isn't enough left, this fails and no order is created.
    if (data.productId) {
      const { data: stockOk, error: stockErr } = await supabaseAdmin.rpc("decrement_stock", {
        p_product_id: data.productId,
        p_color: data.color as string,
        p_size: data.size as string,
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
