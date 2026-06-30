// Thin wrapper around the Meta Pixel global (fbq) injected in __root.tsx.
// Safe to call from anywhere client-side — no-ops during SSR or if the
// pixel script hasn't loaded yet (e.g. ad blockers).
declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

function fbq(...args: unknown[]) {
  if (typeof window === "undefined" || typeof window.fbq !== "function") return;
  window.fbq(...args);
}

export function trackViewContent(product: { id: string; name: string; price: number }) {
  fbq("track", "ViewContent", {
    content_ids: [product.id],
    content_name: product.name,
    content_type: "product",
    value: product.price,
    currency: "NPR",
  });
}

export function trackAddToCart(product: { id: string; name: string; price: number; quantity: number }) {
  fbq("track", "AddToCart", {
    content_ids: [product.id],
    content_name: product.name,
    content_type: "product",
    value: product.price * product.quantity,
    currency: "NPR",
  });
}

export function trackPurchase(order: { orderId: string; total: number }) {
  fbq("track", "Purchase", {
    content_ids: [order.orderId],
    value: order.total,
    currency: "NPR",
  });
}
