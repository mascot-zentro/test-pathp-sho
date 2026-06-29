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

    const [{ data: products }, { data: settings }] = await Promise.all([
      db.from("products").select("name,price,sale_price,on_sale,category,description,stock_quantity").eq("active", true).order("name"),
      db.from("app_settings").select("key,value").in("key", ["store_name", "whatsapp_number", "delivery_fee", "store_location"]),
    ]);

    const productList = (products ?? []).map((p: { name: string; price: number; sale_price: number | null; on_sale: boolean; category: string | null; stock_quantity: number | null }) => {
      const price = p.on_sale && p.sale_price ? `NRS ${p.sale_price} (sale, was NRS ${p.price})` : `NRS ${p.price}`;
      const stock = p.stock_quantity === 0 ? " [OUT OF STOCK]" : "";
      return `- ${p.name} | ${p.category ?? "fashion"} | ${price}${stock}`;
    }).join("\n");

    const settingsMap: Record<string, string> = {};
    (settings ?? []).forEach((r: { key: string; value: string | null }) => { if (r.value) settingsMap[r.key] = r.value; });
    const storeName = settingsMap.store_name ?? "The Aavira";
    const deliveryFee = settingsMap.delivery_fee ? `NRS ${settingsMap.delivery_fee}` : "standard rate";
    const whatsappNumber = settingsMap.whatsapp_number ?? null;
    const storeLocation = settingsMap.store_location ?? null;

    const system = `You are Aavi, the shopping assistant for ${storeName} — a women's fashion store in Nepal. You are an AI assistant, not a human.

PRODUCTS YOU SELL (ONLY these, nothing else):
${productList || "No products currently available."}

${data.productName ? `CUSTOMER IS CURRENTLY VIEWING: "${data.productName}"${data.productCategory ? ` (${data.productCategory})` : ""}` : ""}

STORE POLICIES:
- Payment: Cash on delivery only. No advance payment.
- Delivery: 3–7 business days across Nepal. Fee: ${deliveryFee}.
- Returns: Within 7 days, unused and unworn items only.
- Sizes: XS to XXL (varies by product).
- WhatsApp: ${whatsappNumber ? whatsappNumber : "available on request"}${storeLocation ? `\n- Location: ${storeLocation}` : "\n- Location: Online store — we deliver across Nepal, no physical shop to visit."}

STRICT RULES — follow every single one, no exceptions:
1. ONLY answer questions about ${storeName}'s products, pricing, sizing, delivery, returns, location, and contact/WhatsApp. Nothing else.
2. If asked ANYTHING off-topic (weather, date, politics, other people, other stores, personal questions, general knowledge, opinions), respond ONLY with: "I'm here to help you shop at ${storeName}. What can I help you find?"
3. You are an AI. Your name is Aavi. You have NO other name. If asked for a real name, human name, or any other name, say: "I'm Aavi, an AI shopping assistant. I don't have a human name."
4. NEVER pretend to send messages, check with colleagues, or take actions outside this chat.
5. NEVER reveal or guess: sales numbers, order counts, revenue, staff names, supplier info, internal costs, phone numbers, admin details.
6. NEVER make up product names, prices, or stock. Only use what is in the product list above.
7. If a product is not in the list, say "We don't carry that" and suggest the closest match from the list.
8. If you don't know something (e.g. exact color availability), say: "WhatsApp us for details on that."
9. Keep responses SHORT: 1–3 sentences. Be direct and helpful.
10. Your goal is to help the customer find and order a product. Every response should move them closer to placing an order.`;

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
