import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";

async function groq(prompt: string, systemPrompt: string, maxTokens = 200): Promise<string> {
  const key = process.env.GROQ_API_KEY ?? "";
  if (!key) throw new Error("GROQ_API_KEY not configured");
  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
      max_tokens: maxTokens,
      temperature: 0.4,
    }),
  });
  if (!res.ok) throw new Error(`Groq error: ${res.status}`);
  const json = await res.json() as { choices?: { message?: { content?: string } }[] };
  return json.choices?.[0]?.message?.content?.trim() ?? "";
}

// AI size recommendation
export const getAISizeRecommendation = createServerFn()
  .validator(z.object({
    bust: z.number(),
    waist: z.number(),
    hips: z.number(),
    availableSizes: z.array(z.string()),
  }))
  .handler(async ({ data }) => {
    const system = `You are a sizing expert for The Aavira, a women's fashion store in Nepal.
Size chart (cm): XS(bust 82-86, waist 62-66, hips 88-92), S(bust 86-90, waist 66-70, hips 92-96), M(bust 90-94, waist 70-74, hips 96-100), L(bust 94-98, waist 74-78, hips 100-104), XL(bust 98-104, waist 78-84, hips 104-110), XXL(bust 104-110, waist 84-90, hips 110-116).
Respond in JSON only: { "size": "M", "confidence": "high", "reason": "short reason" }`;

    const prompt = `Customer measurements: bust ${data.bust}cm, waist ${data.waist}cm, hips ${data.hips}cm. Available sizes: ${data.availableSizes.join(", ")}. Recommend the best size.`;

    const raw = await groq(prompt, system, 80);
    try {
      const clean = raw.replace(/```json|```/g, "").trim();
      return JSON.parse(clean) as { size: string; confidence: string; reason: string };
    } catch {
      return { size: data.availableSizes[0] ?? "M", confidence: "low", reason: "Could not determine — please check the size chart." };
    }
  });

// AI chat for customer questions
export const askAIChat = createServerFn()
  .validator(z.object({
    message: z.string().max(500),
    productName: z.string().optional(),
    productCategory: z.string().optional(),
    conversationHistory: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })).max(10),
  }))
  .handler(async ({ data }) => {
    const key = process.env.GROQ_API_KEY ?? "";
    if (!key) return "I'm not available right now. Please WhatsApp us for help!";

    // Fetch live products and store settings server-side
    const { createClient } = await import("@supabase/supabase-js");
    const db = createClient(process.env.SUPABASE_URL ?? "", process.env.SUPABASE_SERVICE_ROLE_KEY ?? "", {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Detect order ID in the message (hex format like 2848FF0E or #2848FF0E)
    const orderIdMatch = data.message.match(/#([A-Z0-9]{6,})/i)
      ?? data.message.match(/\border\s+#?([A-Z0-9]{6,})/i)
      ?? data.conversationHistory.slice(-2).map((m) => m.content).join(" ").match(/#([A-Z0-9]{6,})/i);
    const mentionedOrderId = orderIdMatch?.[1]?.toUpperCase() ?? null;

    const [
      { data: products },
      { data: allSizes },
      { data: settings },
      { data: faqs },
      { data: promos },
      { data: categories },
      orderResult,
    ] = await Promise.all([
      db.from("products").select("id,name,price,sale_price,on_sale,category,description,stock_quantity").eq("active", true).order("name"),
      db.from("product_sizes").select("product_id,name,stock_quantity").order("position"),
      db.from("app_settings").select("key,value").in("key", ["store_name", "whatsapp_number", "delivery_fee", "store_location", "return_policy", "site_description"]),
      db.from("faqs").select("question,answer").eq("active", true).order("position"),
      db.from("promo_codes").select("code,discount_percent,expires_at").eq("active", true),
      db.from("categories").select("name").order("position"),
      mentionedOrderId
        ? db.from("orders").select("id,product_name,status,pathao_status,created_at,customer_name,quantity,total,size,color").ilike("id", `%${mentionedOrderId}%`).limit(1).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const foundOrder = orderResult.data as { id: string; product_name: string; status: string; pathao_status: string | null; created_at: string; customer_name: string; quantity: number; total: number; size: string | null } | null;

    const statusLabels: Record<string, string> = {
      pending: "Pending — not yet dispatched",
      processing: "Processing — being prepared",
      dispatched: "Dispatched — handed to Pathao for delivery",
      delivered: "Delivered — order completed",
      cancelled: "Cancelled",
      returned: "Returned",
    };

    const orderContext = foundOrder
      ? `═══ ORDER LOOKUP RESULT ═══
Order ID: ${foundOrder.id}
Customer: ${foundOrder.customer_name}
Product: ${foundOrder.product_name}${foundOrder.size ? ` | Size: ${foundOrder.size}` : ""}
Quantity: ${foundOrder.quantity} | Total: NRS ${foundOrder.total}
Status: ${statusLabels[foundOrder.status] ?? foundOrder.status}${foundOrder.pathao_status ? `\nPathao courier status: ${foundOrder.pathao_status}` : ""}
Ordered on: ${new Date(foundOrder.created_at).toLocaleDateString("en-NP", { timeZone: "Asia/Kathmandu", dateStyle: "medium" })}`
      : mentionedOrderId
        ? `═══ ORDER LOOKUP ═══\nNo order found with ID containing "${mentionedOrderId}". Tell the customer the ID may be incorrect and suggest they visit /track or WhatsApp us.`
        : "";

    const sizesByProduct: Record<string, string[]> = {};
    for (const s of (allSizes ?? []) as { product_id: string; name: string; stock_quantity: number | null }[]) {
      if (!sizesByProduct[s.product_id]) sizesByProduct[s.product_id] = [];
      const label = s.stock_quantity === 0 ? `${s.name}(OOS)` : s.name;
      sizesByProduct[s.product_id].push(label);
    }

    const productList = (products ?? []).map((p: { id: string; name: string; price: number; sale_price: number | null; on_sale: boolean; category: string | null; description: string | null; stock_quantity: number | null }) => {
      const price = p.on_sale && p.sale_price ? `NRS ${p.sale_price} (on sale, was NRS ${p.price})` : `NRS ${p.price}`;
      const stockStatus = p.stock_quantity === 0 ? "OUT OF STOCK" : "in stock";
      const sizes = sizesByProduct[p.id]?.join(", ") ?? "";
      const desc = p.description ? ` | "${p.description.slice(0, 80)}"` : "";
      return [
        `• ${p.name} | ${p.category ?? "fashion"} | ${price} | ${stockStatus}`,
        sizes ? `  Sizes: ${sizes}` : "",
        desc ? `  Desc: ${desc}` : "",
      ].filter(Boolean).join("\n");
    }).join("\n\n");

    const settingsMap: Record<string, string> = {};
    (settings ?? []).forEach((r: { key: string; value: string | null }) => { if (r.value) settingsMap[r.key] = r.value; });
    const storeName = settingsMap.store_name ?? "The Aavira";
    const deliveryFee = settingsMap.delivery_fee ? `NRS ${settingsMap.delivery_fee}` : "standard rate";
    const whatsappNumber = settingsMap.whatsapp_number ?? null;
    const storeLocation = settingsMap.store_location ?? null;
    const returnPolicy = settingsMap.return_policy ?? "Within 7 days, unused and unworn items only.";

    const faqText = (faqs ?? []).map((f: { question: string; answer: string }) =>
      `Q: ${f.question}\nA: ${f.answer}`
    ).join("\n\n");

    const promoText = (promos ?? []).map((p: { code: string; discount_percent: number; expires_at: string | null }) => {
      const expiry = p.expires_at ? ` (expires ${new Date(p.expires_at).toLocaleDateString("en-NP")})` : "";
      return `${p.code} — ${p.discount_percent}% off${expiry}`;
    }).join(", ");

    const categoryList = (categories ?? []).map((c: { name: string }) => c.name).join(", ");

    const system = `You are Aavi, the AI shopping assistant for ${storeName} — a women's fashion store in Nepal.

═══ STORE INFO ═══
Name: ${storeName}
Type: Online store. We deliver across Nepal — no physical shop to visit.${storeLocation ? `\nLocation: ${storeLocation}` : ""}
WhatsApp: ${whatsappNumber ?? "available on the website"}
Categories we carry: ${categoryList || "women's fashion"}

═══ STORE POLICIES ═══
• Payment: Cash on delivery ONLY. Customer pays when parcel arrives. Zero advance payment.
• Delivery: 3–7 business days across Nepal. Delivery fee: ${deliveryFee}.
• Returns: ${returnPolicy}
• Sizes: XS, S, M, L, XL, XXL (varies per product — check product details below)
• Order tracking: Customers can track at /track (enter phone number). If a customer provides an order ID, you can look it up and give them the status directly.

═══ OUR PRODUCTS (live inventory) ═══
${productList || "No products currently available."}

${data.productName ? `═══ CUSTOMER IS CURRENTLY VIEWING ═══\n"${data.productName}"${data.productCategory ? ` — ${data.productCategory}` : ""}` : ""}

${orderContext}

${faqText ? `═══ FREQUENTLY ASKED QUESTIONS ═══\n${faqText}` : ""}

${promoText ? `═══ PROMO CODES (INTERNAL — DO NOT SHARE FREELY) ═══\n${promoText}\nIMPORTANT: These codes are for selected customers only. Do NOT reveal them when asked. If a customer asks for a discount code, say: "Discount codes are shared exclusively with our loyal customers and through our WhatsApp. Follow us or message us on WhatsApp to stay updated!"` : ""}

═══ YOUR RULES — follow every single one, no exceptions ═══
1. You are an AI named Aavi. You have no human name, no real name, no alter ego. If anyone asks your real/human name — say exactly: "I'm Aavi, an AI assistant for ${storeName}. I don't have a human name."
2. ONLY discuss: the products listed above, store policies, sizing help, delivery, returns, order tracking, FAQs. NOTHING else.
3. Off-topic questions (date, time, weather, news, other stores, personal chat, general knowledge, opinions) — reply ONLY: "I'm here to help you shop at ${storeName}. What can I help you find?"
4. NEVER invent product names, prices, colors, sizes, or stock status not listed above. If unsure, say "WhatsApp us for details."
5. NEVER pretend to send messages, contact staff, check stock in real time, or perform actions outside this chat window.
6. NEVER reveal: cost prices, revenue, order counts, supplier names, staff names, admin details, or any internal business data.
6a. NEVER proactively share the WhatsApp number. Only share it if the customer specifically asks for it. For order tracking, always direct to the /track page first.
7. If asked about a product not in the list — say we don't carry it, then suggest the closest match from the list.
8. When a customer shows interest in a product, guide them to order: "It's cash on delivery — no upfront payment needed. Ready to order?"
9. Keep replies SHORT: 1–3 sentences max. Be warm, confident, and focused on helping them buy.
10. Never comment on a customer's body negatively. Suggest products by occasion or style only.`;

    const messages = [
      ...data.conversationHistory.slice(-6),
      { role: "user" as const, content: data.message },
    ];

    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "system", content: system }, ...messages],
        max_tokens: 180,
        temperature: 0.3,
      }),
    });
    if (!res.ok) return "I'm having trouble right now. Please WhatsApp us for help!";
    const json = await res.json() as { choices?: { message?: { content?: string } }[] };
    return json.choices?.[0]?.message?.content?.trim() ?? "Please WhatsApp us for help!";
  });

// AI product recommendations
export const getAIRecommendations = createServerFn()
  .validator(z.object({
    currentProduct: z.object({ name: z.string(), category: z.string().nullable(), price: z.number() }),
    candidates: z.array(z.object({ id: z.string(), name: z.string(), category: z.string().nullable(), price: z.number() })).max(20),
  }))
  .handler(async ({ data }) => {
    const key = process.env.GROQ_API_KEY ?? "";
    if (!key) return data.candidates.slice(0, 4).map((c) => c.id);

    const system = `You are a fashion recommendation engine for The Aavira, a Nepali women's fashion store. Pick the 4 most complementary products a customer would want after viewing the current product. Consider style, category, price range, and outfit pairing. Return JSON array of IDs only: ["id1","id2","id3","id4"]`;

    const prompt = `Current product: "${data.currentProduct.name}" (${data.currentProduct.category ?? "fashion"}, NRS ${data.currentProduct.price}).
Candidates: ${data.candidates.map((c) => `${c.id}: "${c.name}" (${c.category ?? "fashion"}, NRS ${c.price})`).join("; ")}`;

    try {
      const raw = await groq(prompt, system, 80);
      const clean = raw.replace(/```json|```/g, "").trim();
      const ids = JSON.parse(clean) as string[];
      return ids.filter((id) => data.candidates.some((c) => c.id === id)).slice(0, 4);
    } catch {
      return data.candidates.slice(0, 4).map((c) => c.id);
    }
  });

// AI product description generator
export const generateProductDescription = createServerFn()
  .validator(z.object({
    name: z.string(),
    category: z.string().nullable(),
    price: z.number(),
    sizes: z.array(z.string()).optional(),
  }))
  .handler(async ({ data }) => {
    const system = `You are a copywriter for The Aavira, a premium women's fashion store in Nepal. Write compelling, concise product descriptions in 2-3 sentences. Focus on fit, feel, occasion, and styling. Tone: warm, confident, aspirational. Never mention price. Never use hashtags. Write in English.`;
    const prompt = `Product: "${data.name}"
Category: ${data.category ?? "women's fashion"}
Price: NRS ${data.price}
${data.sizes?.length ? `Sizes: ${data.sizes.join(", ")}` : ""}
Write a 2-3 sentence product description.`;
    return groq(prompt, system, 150);
  });

// AI WhatsApp reply drafter
export const draftWhatsAppReply = createServerFn()
  .validator(z.object({
    customerMessage: z.string().max(500),
    customerName: z.string().optional(),
    orderDetails: z.string().optional(),
  }))
  .handler(async ({ data }) => {
    const { createClient } = await import("@supabase/supabase-js");
    const db = createClient(process.env.SUPABASE_URL ?? "", process.env.SUPABASE_SERVICE_ROLE_KEY ?? "", {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const [{ data: products }, { data: settings }] = await Promise.all([
      db.from("products").select("name,price,sale_price,on_sale,stock_quantity,category").eq("active", true).order("name"),
      db.from("app_settings").select("key,value").in("key", ["store_name", "whatsapp_number", "delivery_fee", "return_policy"]),
    ]);

    const settingsMap: Record<string, string> = {};
    (settings ?? []).forEach((r: { key: string; value: string | null }) => { if (r.value) settingsMap[r.key] = r.value; });

    const productList = (products ?? []).map((p: { name: string; price: number; sale_price: number | null; on_sale: boolean; stock_quantity: number | null; category: string | null }) => {
      const price = p.on_sale && p.sale_price ? `NRS ${p.sale_price} (sale)` : `NRS ${p.price}`;
      const stock = p.stock_quantity === 0 ? "out of stock" : "in stock";
      return `• ${p.name} — ${price} — ${stock}`;
    }).join("\n");

    const system = `You are drafting a WhatsApp reply on behalf of The Aavira, a women's fashion store in Nepal. Write a short, friendly, professional reply in 1-3 sentences. Use "Hi${data.customerName ? ` ${data.customerName.split(" ")[0]}` : ""}!" as the greeting. We do Cash on Delivery only. Delivery: 3-7 days. Delivery fee: ${settingsMap.delivery_fee ? `NRS ${settingsMap.delivery_fee}` : "standard rate"}. Return policy: ${settingsMap.return_policy ?? "7 days unused"}. Write only the reply text — no labels, no quotes.`;

    const prompt = `Customer message: "${data.customerMessage}"
${data.orderDetails ? `Order context: ${data.orderDetails}` : ""}
Our products:
${productList}
Draft a helpful WhatsApp reply.`;

    return groq(prompt, system, 120);
  });

// AI: Thank you for first order
export const draftFirstOrderThankYou = createServerFn()
  .validator(z.object({
    customerName: z.string(),
    productName: z.string(),
    total: z.number(),
  }))
  .handler(async ({ data }) => {
    const system = `You are writing a warm WhatsApp message on behalf of The Aavira, a women's fashion store in Nepal. Tone: warm, genuine, not salesy. 2-3 sentences max. Start with "Hi ${data.customerName.split(" ")[0]}!". Never use hashtags. Write only the message text.`;
    const prompt = `Write a thank-you WhatsApp message for a first-time customer. They ordered "${data.productName}" for NRS ${data.total}. Make them feel welcomed and excited about their purchase.`;
    return groq(prompt, system, 120);
  });

// AI: Instagram repost request
export const draftInstagramRepostRequest = createServerFn()
  .validator(z.object({
    customerName: z.string(),
    productName: z.string(),
  }))
  .handler(async ({ data }) => {
    const system = `You are writing a WhatsApp message on behalf of The Aavira, a Nepali women's fashion store. Ask the customer to tag us on Instagram when they wear their purchase. Tone: friendly, casual, not pushy. 2-3 sentences. Start with "Hi ${data.customerName.split(" ")[0]}!". Include "@theaavira" as the Instagram handle. Write only the message text.`;
    const prompt = `Customer bought "${data.productName}". Ask them to tag us in their Instagram photo when they wear it.`;
    return groq(prompt, system, 100);
  });

// AI: Testimonial collector
export const draftTestimonialRequest = createServerFn()
  .validator(z.object({
    customerName: z.string(),
    productName: z.string(),
  }))
  .handler(async ({ data }) => {
    const system = `You are writing a WhatsApp message on behalf of The Aavira, a Nepali women's fashion store. Ask for a short 1-2 sentence review. Tone: soft, genuine, not pushy. 2-3 sentences max. Start with "Hi ${data.customerName.split(" ")[0]}!". Write only the message text.`;
    const prompt = `Customer bought "${data.productName}". Ask them to share a quick review or feedback about their experience.`;
    return groq(prompt, system, 100);
  });

// AI: Before/after styling story ask
export const draftStylingStoryAsk = createServerFn()
  .validator(z.object({
    customerName: z.string(),
    productName: z.string(),
  }))
  .handler(async ({ data }) => {
    const system = `You are writing a WhatsApp message on behalf of The Aavira, a Nepali women's fashion store. Ask the customer to share how they styled their purchase — a photo or description. Tone: fun, encouraging, genuine. 2-3 sentences max. Start with "Hi ${data.customerName.split(" ")[0]}!". Write only the message text.`;
    const prompt = `Customer bought "${data.productName}". Ask them to share their styling — how they wore it, what they paired it with, or a photo of their look.`;
    return groq(prompt, system, 100);
  });

// AI: Payment confirmation message
export const draftPaymentConfirmation = createServerFn()
  .validator(z.object({
    customerName: z.string(),
    productName: z.string(),
    total: z.number(),
    orderId: z.string(),
  }))
  .handler(async ({ data }) => {
    const system = `You are writing a WhatsApp order confirmation message on behalf of The Aavira, a Nepali women's fashion store (Cash on Delivery). Tone: professional, warm, reassuring. 2-3 sentences. Start with "Hi ${data.customerName.split(" ")[0]}!". Include the order summary. Write only the message text.`;
    const prompt = `Confirm receipt of order #${data.orderId.slice(0, 8).toUpperCase()} for "${data.productName}" totalling NRS ${data.total}. Mention it will be delivered in 3-7 business days.`;
    return groq(prompt, system, 130);
  });

// AI: Address confirmation message
export const draftAddressConfirmation = createServerFn()
  .validator(z.object({
    customerName: z.string(),
    productName: z.string(),
    address: z.string(),
  }))
  .handler(async ({ data }) => {
    const system = `You are writing a WhatsApp message on behalf of The Aavira, a Nepali women's fashion store. Ask the customer to confirm their delivery address before shipping. Tone: friendly, professional. 2-3 sentences. Start with "Hi ${data.customerName.split(" ")[0]}!". Write only the message text.`;
    const prompt = `Before shipping "${data.productName}", confirm the delivery address: "${data.address}". Ask them to reply YES to confirm or share a corrected address.`;
    return groq(prompt, system, 120);
  });

// AI semantic search
export const aiSearch = createServerFn()
  .validator(z.object({
    query: z.string().max(200),
    products: z.array(z.object({ id: z.string(), name: z.string(), category: z.string().nullable(), description: z.string().nullable(), price: z.number() })).max(100),
  }))
  .handler(async ({ data }) => {
    const key = process.env.GROQ_API_KEY ?? "";
    if (!key) return null; // fall back to keyword search

    const system = `You are a search engine for The Aavira, a Nepali women's fashion store. Given a natural language query, return the IDs of the most relevant products (up to 8). Return JSON array: ["id1","id2",...]. If nothing is relevant, return [].`;

    const prompt = `Query: "${data.query}"
Products: ${data.products.map((p) => `${p.id}: "${p.name}" | ${p.category ?? ""} | ${(p.description ?? "").slice(0, 60)}`).join("\n")}`;

    try {
      const raw = await groq(prompt, system, 100);
      const clean = raw.replace(/```json|```/g, "").trim();
      const ids = JSON.parse(clean) as string[];
      return ids.filter((id) => data.products.some((p) => p.id === id));
    } catch {
      return null;
    }
  });
