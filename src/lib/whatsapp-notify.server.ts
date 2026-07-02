// Sends order confirmations via WhatsApp Cloud API (Meta).
// Uses an approved message template because the customer hasn't messaged
// us first — WhatsApp blocks free-form replies outside a 24h
// customer-initiated session. Submit "order_confirmation" for approval in
// Meta Business Manager (Account tools > Message templates) before this
// will actually deliver; until approved, sends just fail silently like a
// misconfigured Discord webhook would.
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID ?? "";
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN ?? "";
const GRAPH_URL = PHONE_NUMBER_ID ? `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages` : "";

// Customers type a local 10-digit Nepali number at checkout (placeholder
// "98XXXXXXXX"), not E.164 — WhatsApp's API requires the country code.
function toWhatsAppNumber(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("977")) return digits;
  if (digits.length === 10) return `977${digits}`;
  return digits.length >= 10 ? digits : null;
}

async function sendTemplate(toPhone: string, templateName: string, headerParams: string[], bodyParams: string[]): Promise<void> {
  const to = toWhatsAppNumber(toPhone);
  if (!to || !GRAPH_URL || !ACCESS_TOKEN) return;

  try {
    const payload = {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: templateName,
        language: { code: "en" },
        components: [
          { type: "header", parameters: headerParams.map((text) => ({ type: "text", text })) },
          { type: "body", parameters: bodyParams.map((text) => ({ type: "text", text })) },
        ],
      },
    };
    console.log("[whatsapp] sending to", to, "template:", templateName, "payload:", JSON.stringify(payload));
    const res = await fetch(GRAPH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ACCESS_TOKEN}` },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    console.log("[whatsapp] response status:", res.status, "body:", JSON.stringify(json));
  } catch (err) {
    console.error("[whatsapp] fetch error:", err);
  }
}

export async function notifyWhatsAppOrderConfirmed(order: {
  customerPhone: string;
  customerName: string;
  customerAddress: string;
  orderId: string;
  productName: string;
  total: number;
}): Promise<void> {
  const shortId = order.orderId.slice(0, 8).toUpperCase();
  // Header expected: "Namaste {{1}} ji"
  // Body expected: "Thank you for shopping with The Aavira. Your order #{{1}} for {{2}} (NRS {{3}}) has been confirmed and will be delivered to {{4}}. Payment is cash on delivery — no advance required. We truly appreciate your trust in us and hope you love it. Track your order anytime at theaavira.com/track"
  await sendTemplate(
    order.customerPhone,
    "order_confirmation",
    [order.customerName],
    [shortId, order.productName, String(order.total), order.customerAddress],
  );
}
