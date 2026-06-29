import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Returns non-PII order fields for the confirmation page.
// Uses supabaseAdmin (service role) so no client-side RLS bypass is needed.
// Scoped to orders created in the last 24h to prevent historical enumeration by UUID.
export const getOrderConfirmation = createServerFn({ method: "GET" })
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("product_name,product_id,customer_name,total,delivery_fee,created_at,color,size,quantity")
      .eq("id", data.id)
      .gt("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .maybeSingle();

    if (!order) return null;

    // Fetch product image
    const { data: product } = await supabaseAdmin
      .from("products")
      .select("image_url")
      .eq("id", order.product_id)
      .maybeSingle();

    return {
      product_name: order.product_name,
      product_id: order.product_id,
      customer_name: order.customer_name,
      total: order.total,
      delivery_fee: order.delivery_fee,
      created_at: order.created_at,
      color: order.color,
      size: order.size,
      quantity: order.quantity,
      image_url: (product as { image_url: string | null } | null)?.image_url ?? null,
    };
  });
