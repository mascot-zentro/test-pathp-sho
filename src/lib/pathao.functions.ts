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
// Pulls the live status from Pathao for one order and stores it in
// orders.pathao_status, separate from the admin's own manual `status`
// workflow field so neither overwrites the other. If Pathao reports the
// shipment as Cancelled or Returned, the reserved stock is automatically
// added back — but only once per order (stock_restocked guards against
// re-crediting if this gets synced again after the fact).
export const syncOrderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ orderId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { data: roles } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId).eq("role", "admin");
    if (!roles || roles.length === 0) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .select("pathao_consignment_id, product_id, color, size, quantity, stock_restocked, status")
      .eq("id", data.orderId)
      .maybeSingle();
    if (error || !order) throw new Error("Order not found");
    if (!order.pathao_consignment_id) throw new Error("This order has no Pathao consignment yet");
    const { pathao } = await import("./pathao.server");
    const res = (await pathao.orderInfo(order.pathao_consignment_id)) as { data?: { order_status_slug?: string } };
    const slug = res?.data?.order_status_slug ?? null;
    await supabaseAdmin.from("orders").update({ pathao_status: slug }).eq("id", data.orderId);

    let restocked = false;
    const isCancelledOrReturned = !!slug && /cancel|return/i.test(slug);
    if (isCancelledOrReturned && !order.stock_restocked && order.product_id) {
      const { error: incErr } = await supabaseAdmin.rpc("increment_stock", {
        p_product_id: order.product_id,
        p_color: order.color as string,
        p_size: order.size as string,
        p_quantity: order.quantity,
      });
      if (!incErr) {
        await supabaseAdmin.from("orders").update({ stock_restocked: true }).eq("id", data.orderId);
        restocked = true;
      }
    }
    // Keep the admin's own workflow status in sync with what the courier
    // actually did. Without this, "Total sales" (which only excludes
    // status === "cancelled") kept counting orders the courier had
    // already cancelled, because nothing ever told the admin field that
    // happened — the two statuses are intentionally separate (admin
    // workflow vs courier-reported) but a courier cancellation should
    // always win over an order still sitting at "submitted"/"shipped".
    // Never downgrades an order already marked "delivered".
    let statusUpdated = false;
    if (isCancelledOrReturned && order.status !== "cancelled" && order.status !== "delivered") {
      await supabaseAdmin.from("orders").update({ status: "cancelled" }).eq("id", data.orderId);
      statusUpdated = true;
    }

    return { pathaoStatus: slug, restocked, statusUpdated };
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
  promoCode: z.string().trim().toUpperCase().min(1).optional().nullable(),
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
    promoCode?: string | null;
    discountAmount?: number;
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
      promo_code: args.promoCode ?? null,
      discount_amount: args.discountAmount ?? 0,
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

// Read-only check used for live UI feedback while typing a code — does NOT
// consume a use. The actual redemption (which does count the use) happens
// atomically inside createOrder/createCartOrder at submit time.
export const previewPromoCode = createServerFn({ method: "POST" })
  .inputValidator(z.object({ code: z.string().trim().min(1) }))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: promo } = await supabaseAdmin.from("promo_codes").select("*").ilike("code", data.code).maybeSingle();
    if (!promo || !promo.active) return { valid: false, message: "Invalid promo code." };
    const now = new Date();
    if (promo.starts_at && now < new Date(promo.starts_at)) return { valid: false, message: "This code isn't active yet." };
    if (promo.expires_at && now > new Date(promo.expires_at)) return { valid: false, message: "This code has expired." };
    if (promo.max_uses !== null && promo.used_count >= promo.max_uses) return { valid: false, message: "This code has reached its usage limit." };
    return { valid: true, discountPercent: Number(promo.discount_percent) };
  });

export const createOrder = createServerFn({ method: "POST" })
  .inputValidator(orderSchema)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const subtotal = data.unitPrice * data.quantity;

    // Promo code: redeemed (and its use counted) before stock is touched.
    // If stock then fails, the redemption is released so the code isn't
    // burned on a failed order.
    let discountAmount = 0;
    if (data.promoCode) {
      const { data: discountPercent, error: promoErr } = await supabaseAdmin.rpc("redeem_promo_code", { p_code: data.promoCode });
      if (promoErr) throw new Error(promoErr.message);
      if (discountPercent === null) throw new Error("That promo code isn't valid, or has expired or been used up.");
      discountAmount = Math.round(subtotal * (Number(discountPercent) / 100) * 100) / 100;
    }
    const total = subtotal - discountAmount + data.deliveryFee;

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
      if (data.promoCode) await supabaseAdmin.rpc("release_promo_code", { p_code: data.promoCode });
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
      if (stockErr) {
        if (data.promoCode) await supabaseAdmin.rpc("release_promo_code", { p_code: data.promoCode });
        throw new Error(stockErr.message);
      }
      if (!stockOk) {
        if (data.promoCode) await supabaseAdmin.rpc("release_promo_code", { p_code: data.promoCode });
        throw new Error("Sorry, this item just went out of stock.");
      }
    }

    return insertOrderAndSubmitToPathao(supabaseAdmin, {
      productId: data.productId,
      productName: data.productName,
      color: data.color,
      size: data.size,
      quantity: data.quantity,
      unitPrice: data.unitPrice,
      deliveryFee: data.deliveryFee,
      promoCode: data.promoCode ?? null,
      discountAmount,
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

const cartItemSchema = z.object({
  productId: z.string().uuid(),
  productName: z.string().min(1),
  color: z.string().nullable(),
  size: z.string().nullable(),
  quantity: z.number().int().min(1),
  unitPrice: z.number().min(0),
  weight: z.number().min(0.5).max(10).default(0.5),
});

const cartOrderSchema = z.object({
  items: z.array(cartItemSchema).min(1).max(20),
  customerName: z.string().min(2).max(100),
  customerPhone: z.string().min(10).max(15),
  customerAddress: z.string().min(5).max(220),
  cityId: z.number().int(),
  zoneId: z.number().int(),
  areaId: z.number().int().optional().nullable(),
  specialInstruction: z.string().optional().nullable(),
  deliveryFee: z.number().min(0).default(0),
  promoCode: z.string().trim().toUpperCase().min(1).optional().nullable(),
  company: z.string().max(0).optional(),
});

// Cart checkout: one combined Pathao shipment, but one `orders` row per line
// item (sharing order_group_id) so inventory and admin reporting stay
// per-product. Discount and delivery are distributed proportionally across
// the rows so summed totals across the group match the actual charge.
export const createCartOrder = createServerFn({ method: "POST" })
  .inputValidator(cartOrderSchema)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const subtotal = data.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);

    let discountAmount = 0;
    if (data.promoCode) {
      const { data: discountPercent, error: promoErr } = await supabaseAdmin.rpc("redeem_promo_code", { p_code: data.promoCode });
      if (promoErr) throw new Error(promoErr.message);
      if (discountPercent === null) throw new Error("That promo code isn't valid, or has expired or been used up.");
      discountAmount = Math.round(subtotal * (Number(discountPercent) / 100) * 100) / 100;
    }
    const total = subtotal - discountAmount + data.deliveryFee;

    const RATE_LIMIT_WINDOW_MIN = 10;
    const RATE_LIMIT_MAX_ORDERS = 3;
    const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MIN * 60 * 1000).toISOString();
    const { count: recentCount } = await supabaseAdmin
      .from("orders").select("id", { count: "exact", head: true })
      .eq("customer_phone", data.customerPhone).gte("created_at", since);
    if ((recentCount ?? 0) >= RATE_LIMIT_MAX_ORDERS) {
      if (data.promoCode) await supabaseAdmin.rpc("release_promo_code", { p_code: data.promoCode });
      throw new Error("Too many orders from this phone number recently. Please wait a few minutes, or contact us directly if you need to order more.");
    }

    // Reserve stock for every line item. If any one fails, roll back the
    // ones already reserved (decrement_stock with a negative quantity adds
    // stock back) and release the promo code before erroring out.
    const reserved: typeof data.items = [];
    for (const item of data.items) {
      const { data: stockOk, error: stockErr } = await supabaseAdmin.rpc("decrement_stock", {
        p_product_id: item.productId,
        p_color: item.color as string,
        p_size: item.size as string,
        p_quantity: item.quantity,
      });
      if (stockErr || !stockOk) {
        for (const r of reserved) {
          await supabaseAdmin.rpc("decrement_stock", { p_product_id: r.productId, p_color: r.color as string, p_size: r.size as string, p_quantity: -r.quantity });
        }
        if (data.promoCode) await supabaseAdmin.rpc("release_promo_code", { p_code: data.promoCode });
        throw new Error(stockErr?.message ?? `Sorry, "${item.productName}" just went out of stock.`);
      }
      reserved.push(item);
    }

    const groupId = crypto.randomUUID();
    let discountLeft = discountAmount;
    let deliveryLeft = data.deliveryFee;
    const rows = data.items.map((item, idx) => {
      const itemSubtotal = item.unitPrice * item.quantity;
      const isLast = idx === data.items.length - 1;
      const share = subtotal > 0 ? itemSubtotal / subtotal : 0;
      const rowDiscount = isLast ? discountLeft : Math.round(discountAmount * share * 100) / 100;
      const rowDelivery = isLast ? deliveryLeft : Math.round(data.deliveryFee * share * 100) / 100;
      discountLeft -= rowDiscount;
      deliveryLeft -= rowDelivery;
      return {
        product_id: item.productId,
        product_name: item.productName,
        color: item.color,
        size: item.size,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        delivery_fee: rowDelivery,
        promo_code: data.promoCode ?? null,
        discount_amount: rowDiscount,
        total: Math.round((itemSubtotal - rowDiscount + rowDelivery) * 100) / 100,
        customer_name: data.customerName,
        customer_phone: data.customerPhone,
        customer_address: data.customerAddress,
        recipient_city: data.cityId,
        recipient_zone: data.zoneId,
        recipient_area: data.areaId ?? null,
        special_instruction: data.specialInstruction ?? null,
        status: "pending",
        order_group_id: groupId,
      };
    });

    const { data: insertedOrders, error: orderErr } = await supabaseAdmin.from("orders").insert(rows).select("id");
    if (orderErr || !insertedOrders) throw new Error(orderErr?.message ?? "Order insert failed");
    const groupOrderIds = insertedOrders.map((o) => o.id);

    const { data: setting } = await supabaseAdmin.from("app_settings").select("value").eq("key", "pathao_store_id").maybeSingle();
    const storeId = setting?.value ? Number(setting.value) : null;
    if (!storeId) {
      await supabaseAdmin.from("orders").update({ status: "awaiting_pathao_config" }).in("id", groupOrderIds);
      return { orderIds: groupOrderIds, pathao: null, warning: "Pathao store_id not configured in admin settings" };
    }

    const combinedDescription = data.items
      .map((i) => `${i.productName}${[i.color, i.size].filter(Boolean).length ? ` (${[i.color, i.size].filter(Boolean).join(", ")})` : ""} x${i.quantity}`)
      .join("; ");
    const combinedWeight = Math.min(10, Math.max(0.5, data.items.reduce((s, i) => s + i.weight * i.quantity, 0)));
    const combinedQuantity = data.items.reduce((s, i) => s + i.quantity, 0);

    try {
      const { pathao } = await import("./pathao.server");
      const pathaoRes = (await pathao.createOrder({
        store_id: storeId,
        merchant_order_id: groupId,
        recipient_name: data.customerName,
        recipient_phone: data.customerPhone,
        recipient_address: data.customerAddress,
        recipient_city: data.cityId,
        recipient_zone: data.zoneId,
        ...(data.areaId ? { recipient_area: data.areaId } : {}),
        delivery_type: 48,
        item_type: 2,
        special_instruction: data.specialInstruction ?? "",
        item_quantity: combinedQuantity,
        item_weight: combinedWeight,
        item_description: combinedDescription,
        amount_to_collect: Math.round(total),
      })) as { data?: { consignment_id?: string } };

      await supabaseAdmin.from("orders").update({
        pathao_consignment_id: pathaoRes?.data?.consignment_id ?? null,
        pathao_response: pathaoRes as never,
        status: "submitted",
      }).in("id", groupOrderIds);
      return { orderIds: groupOrderIds, pathao: pathaoRes };
    } catch (e) {
      await supabaseAdmin.from("orders").update({ status: "pathao_failed", pathao_response: { error: String(e) } as never }).in("id", groupOrderIds);
      return { orderIds: groupOrderIds, pathao: null, warning: `Order saved, Pathao failed: ${String(e)}` };
    }
  });
