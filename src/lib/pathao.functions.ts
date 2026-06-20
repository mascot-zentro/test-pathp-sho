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

// Returns the current Pathao credentials with secrets masked, so the admin
// can see what's configured (and whether it looks like sandbox vs a real
// production client_id) without the client_secret/password ever reaching
// the browser in plain text.
export const getPathaoCredentials = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: roles } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId).eq("role", "admin");
    if (!roles || roles.length === 0) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.from("pathao_credentials").select("*").eq("id", 1).maybeSingle();
    const mask = (v: string | null | undefined) => (v ? `${"•".repeat(Math.max(0, v.length - 4))}${v.slice(-4)}` : "");
    return {
      configured: !!data,
      baseUrl: data?.base_url ?? "",
      clientId: data?.client_id ?? "",
      username: data?.username ?? "",
      clientSecretMasked: mask(data?.client_secret),
      passwordMasked: mask(data?.password),
      updatedAt: data?.updated_at ?? null,
    };
  });

const pathaoCredentialsSchema = z.object({
  baseUrl: z.string().url(),
  clientId: z.string().min(1),
  // Empty string means "keep the existing secret" — lets the admin update
  // baseUrl/clientId/username alone without retyping the secret/password
  // every time, since the masked value is never sent back from the GET.
  clientSecret: z.string(),
  username: z.string().min(1),
  password: z.string(),
});

export const savePathaoCredentials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(pathaoCredentialsSchema)
  .handler(async ({ data, context }) => {
    const { data: roles } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId).eq("role", "admin");
    if (!roles || roles.length === 0) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const existing = await supabaseAdmin.from("pathao_credentials").select("client_secret,password").eq("id", 1).maybeSingle();

    const { error } = await supabaseAdmin.from("pathao_credentials").upsert({
      id: 1,
      base_url: data.baseUrl,
      client_id: data.clientId,
      client_secret: data.clientSecret || existing.data?.client_secret || "",
      username: data.username,
      password: data.password || existing.data?.password || "",
      updated_at: new Date().toISOString(),
      updated_by: context.userId,
    });
    if (error) throw new Error(error.message);

    const { clearPathaoConfigCache } = await import("./pathao.server");
    clearPathaoConfigCache();
    return { ok: true };
  });

// Live delivery-fee quote for the checkout page. Public — no auth needed,
// it's the same information a customer would see before placing the order.
// Reads pathao_store_id from settings server-side so the client never needs
// to know it. Returns a discriminated result rather than just a number or
// null: a missing store_id and a failed Pathao API call used to both
// collapse to "no fee", which left the checkout UI stuck showing "Select
// city & zone" forever even after city/zone *were* selected — there was no
// way to tell the customer (or the admin debugging it) why.
export const getDeliveryEstimate = createServerFn({ method: "POST" })
  .inputValidator(z.object({ cityId: z.number(), zoneId: z.number(), weight: z.number().min(0.5).max(10) }))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: setting } = await supabaseAdmin.from("app_settings").select("value").eq("key", "pathao_store_id").maybeSingle();
    const storeId = setting?.value ? Number(setting.value) : null;
    if (!storeId) return { ok: false as const, reason: "not_configured" as const };
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
      const fee = res?.data?.final_price;
      if (typeof fee !== "number") return { ok: false as const, reason: "unavailable" as const };
      return { ok: true as const, fee };
    } catch {
      return { ok: false as const, reason: "unavailable" as const };
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
  // Delivery fee quoted to the customer at checkout time (NRS). Stored on the
  // order and added to amount_to_collect so Pathao collects the full amount.
  // If not yet known (delivery location not set), submit is blocked on the client.
  deliveryFee: z.number().min(0).default(0),
  company: z.string().max(0).optional(), // honeypot — real users never see/fill this field
});

// Shared by createOrder (public checkout) and createManualOrder (admin
// logging an Instagram/TikTok/etc. sale): inserts the order row, then tries
// to submit it to Pathao, updating status based on the outcome either way.
async function insertOrderAndSubmitToPathao(
  supabaseAdmin: typeof import("@/integrations/supabase/client.server").supabaseAdmin,
  args: {
    productId: string | null;
    productName: string;
    color: string | null;
    size: string | null;
    quantity: number;
    unitPrice: number;
    deliveryFee: number;
    total: number;
    customerName: string;
    customerPhone: string;
    customerAddress: string;
    cityId: number;
    zoneId: number;
    areaId: number | null;
    specialInstruction: string | null;
    weight: number;
    source: string;
  },
) {
  const { data: order, error: orderErr } = await supabaseAdmin
    .from("orders")
    .insert({
      product_id: args.productId,
      product_name: args.productName,
      color: args.color,
      size: args.size,
      quantity: args.quantity,
      unit_price: args.unitPrice,
      delivery_fee: args.deliveryFee,
      total: args.total,
      customer_name: args.customerName,
      customer_phone: args.customerPhone,
      customer_address: args.customerAddress,
      recipient_city: args.cityId,
      recipient_zone: args.zoneId,
      recipient_area: args.areaId ?? null,
      special_instruction: args.specialInstruction ?? null,
      status: "pending",
      source: args.source,
    })
    .select()
    .single();
  if (orderErr || !order) throw new Error(orderErr?.message ?? "Order insert failed");

  const { data: setting } = await supabaseAdmin.from("app_settings").select("value").eq("key", "pathao_store_id").maybeSingle();
  const storeId = setting?.value ? Number(setting.value) : null;

  if (!storeId) {
    await supabaseAdmin.from("orders").update({ status: "awaiting_pathao_config" }).eq("id", order.id);
    return { orderId: order.id, pathao: null, warning: "Pathao store_id not configured in admin settings" };
  }

  const variantLabel = [args.color, args.size].filter(Boolean).join(", ");
  try {
    const { pathao } = await import("./pathao.server");
    const pathaoRes = (await pathao.createOrder({
      store_id: storeId,
      merchant_order_id: order.id,
      recipient_name: args.customerName,
      recipient_phone: args.customerPhone,
      recipient_address: args.customerAddress,
      recipient_city: args.cityId,
      recipient_zone: args.zoneId,
      ...(args.areaId ? { recipient_area: args.areaId } : {}),
      delivery_type: 48,
      item_type: 2,
      special_instruction: args.specialInstruction ?? "",
      item_quantity: args.quantity,
      item_weight: args.weight,
      item_description: `${args.productName}${variantLabel ? ` (${variantLabel})` : ""}`,
      amount_to_collect: Math.round(args.total),
    })) as { data?: { consignment_id?: string } };

    await supabaseAdmin
      .from("orders")
      .update({
        pathao_consignment_id: pathaoRes?.data?.consignment_id ?? null,
        pathao_response: pathaoRes as never,
        status: "submitted",
      })
      .eq("id", order.id);
    return { orderId: order.id, pathao: pathaoRes };
  } catch (e) {
    await supabaseAdmin.from("orders").update({ status: "pathao_failed", pathao_response: { error: String(e) } as never }).eq("id", order.id);
    return { orderId: order.id, pathao: null, warning: `Order saved, Pathao failed: ${String(e)}` };
  }
}

export const createOrder = createServerFn({ method: "POST" })
  .inputValidator(orderSchema)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const subtotal = data.unitPrice * data.quantity;
    const total = subtotal + data.deliveryFee;

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

    return insertOrderAndSubmitToPathao(supabaseAdmin, {
      productId: data.productId,
      productName: data.productName,
      color: data.color,
      size: data.size,
      quantity: data.quantity,
      unitPrice: data.unitPrice,
      deliveryFee: data.deliveryFee,
      total,
      customerName: data.customerName,
      customerPhone: data.customerPhone,
      customerAddress: data.customerAddress,
      cityId: data.cityId,
      zoneId: data.zoneId,
      areaId: data.areaId ?? null,
      specialInstruction: data.specialInstruction ?? null,
      weight: data.weight,
      source: "website",
    });
  });

// Admin-only: logs a sale that actually happened over Instagram/TikTok/etc.
// DMs, so it still gets fulfilled through Pathao like any other order. No
// phone-number rate limit (the admin isn't spamming themselves), and the
// product is optional — a one-off social sale might not be in the catalog.
const manualOrderSchema = z.object({
  productId: z.string().uuid().nullable(),
  productName: z.string().min(1),
  color: z.string().nullable(),
  size: z.string().nullable(),
  quantity: z.number().int().min(1),
  unitPrice: z.number().min(0),
  customerName: z.string().min(2).max(100),
  customerPhone: z.string().min(7).max(20),
  customerAddress: z.string().min(5).max(220),
  // Optional: omitted (or skipPathao=true) means this order is logged for
  // records/stock purposes only and never sent to Pathao — e.g. the admin
  // is arranging delivery another way, or it's a pickup order.
  cityId: z.number().int().optional().nullable(),
  zoneId: z.number().int().optional().nullable(),
  areaId: z.number().int().optional().nullable(),
  specialInstruction: z.string().optional().nullable(),
  weight: z.number().min(0.1).max(50).default(0.5),
  deliveryFee: z.number().min(0).default(0),
  source: z.enum(["instagram", "tiktok", "facebook", "whatsapp", "manual"]),
  skipStockCheck: z.boolean().default(false),
  skipPathao: z.boolean().default(false),
});

export const createManualOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(manualOrderSchema)
  .handler(async ({ data, context }) => {
    const { data: roles } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId).eq("role", "admin");
    if (!roles || roles.length === 0) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const subtotal = data.unitPrice * data.quantity;
    const skipPathao = data.skipPathao || !data.cityId || !data.zoneId;
    const total = subtotal + (skipPathao ? 0 : data.deliveryFee);

    if (data.productId && !data.skipStockCheck) {
      const { data: stockOk, error: stockErr } = await supabaseAdmin.rpc("decrement_stock", {
        p_product_id: data.productId,
        p_color: data.color as string,
        p_size: data.size as string,
        p_quantity: data.quantity,
      });
      if (stockErr) throw new Error(stockErr.message);
      if (!stockOk) throw new Error("Not enough stock for this product/variant. Adjust quantity or stock first.");
    }

    if (skipPathao) {
      // Logged for records and stock only — no Pathao consignment created.
      const { data: order, error } = await supabaseAdmin
        .from("orders")
        .insert({
          product_id: data.productId,
          product_name: data.productName,
          color: data.color,
          size: data.size,
          quantity: data.quantity,
          unit_price: data.unitPrice,
          delivery_fee: 0,
          total,
          customer_name: data.customerName,
          customer_phone: data.customerPhone,
          customer_address: data.customerAddress,
          recipient_city: data.cityId ?? null,
          recipient_zone: data.zoneId ?? null,
          recipient_area: data.areaId ?? null,
          special_instruction: data.specialInstruction ?? null,
          status: "pending",
          source: data.source,
        })
        .select()
        .single();
      if (error || !order) throw new Error(error?.message ?? "Order insert failed");
      return { orderId: order.id, pathao: null, warning: undefined };
    }

    return insertOrderAndSubmitToPathao(supabaseAdmin, {
      productId: data.productId,
      productName: data.productName,
      color: data.color,
      size: data.size,
      quantity: data.quantity,
      unitPrice: data.unitPrice,
      deliveryFee: data.deliveryFee,
      total,
      customerName: data.customerName,
      customerPhone: data.customerPhone,
      customerAddress: data.customerAddress,
      cityId: data.cityId as number,
      zoneId: data.zoneId as number,
      areaId: data.areaId ?? null,
      specialInstruction: data.specialInstruction ?? null,
      weight: data.weight,
      source: data.source,
    });
  });
