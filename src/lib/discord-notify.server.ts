const WEBHOOK_URL = process.env.DISCORD_ORDER_WEBHOOK_URL ?? "";

type OrderNotifyPayload = {
  orderId: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  productName: string;
  color: string | null | undefined;
  size: string | null | undefined;
  quantity: number;
  total: number;
  deliveryFee: number;
  source: string;
};

export async function notifyDiscordNewOrder(order: OrderNotifyPayload): Promise<void> {
  if (!WEBHOOK_URL) return;

  const variant = [order.color, order.size].filter(Boolean).join(", ");
  const shortId = order.orderId.slice(0, 8).toUpperCase();

  const embed = {
    title: "🛍️ New Order!",
    color: 0xc4762d,
    fields: [
      { name: "Order", value: `#${shortId}`, inline: true },
      { name: "Total (COD)", value: `NRS ${order.total}`, inline: true },
      { name: "Source", value: order.source ?? "web", inline: true },
      { name: "Product", value: order.productName + (variant ? ` — ${variant}` : ""), inline: false },
      { name: "Qty", value: String(order.quantity), inline: true },
      { name: "Delivery fee", value: `NRS ${order.deliveryFee}`, inline: true },
      { name: "Customer", value: order.customerName, inline: true },
      { name: "Phone", value: order.customerPhone, inline: true },
      { name: "Address", value: order.customerAddress, inline: false },
    ],
    timestamp: new Date().toISOString(),
    footer: { text: "The Aavira" },
  };

  try {
    await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed] }),
    });
  } catch {
    // Non-critical — never let a failed notification break an order
  }
}
