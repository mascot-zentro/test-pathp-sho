import { useCallback, useEffect, useState } from "react";

export type CartItem = {
  key: string; // productId + color + size, so the same product in different variants is a separate line
  productId: string;
  productName: string;
  image: string | null;
  color: string | null;
  size: string | null;
  unitPrice: number;
  weight: number;
  quantity: number;
};

const STORAGE_KEY = "cart_v1";

function read(): CartItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CartItem[]) : [];
  } catch {
    return [];
  }
}

function write(items: CartItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  window.dispatchEvent(new Event("cart-updated"));
}

export function cartKey(productId: string, color: string | null, size: string | null) {
  return [productId, color ?? "", size ?? ""].join("::");
}

export function useCart() {
  const [items, setItems] = useState<CartItem[]>([]);

  useEffect(() => {
    setItems(read());
    const onUpdate = () => setItems(read());
    window.addEventListener("cart-updated", onUpdate);
    window.addEventListener("storage", onUpdate);
    return () => {
      window.removeEventListener("cart-updated", onUpdate);
      window.removeEventListener("storage", onUpdate);
    };
  }, []);

  const addItem = useCallback((item: Omit<CartItem, "key" | "quantity">, qty: number) => {
    const key = cartKey(item.productId, item.color, item.size);
    const current = read();
    const existing = current.find((i) => i.key === key);
    const next = existing
      ? current.map((i) => (i.key === key ? { ...i, quantity: i.quantity + qty } : i))
      : [...current, { ...item, key, quantity: qty }];
    write(next);
  }, []);

  const updateQty = useCallback((key: string, qty: number) => {
    const next = read().map((i) => (i.key === key ? { ...i, quantity: Math.max(1, qty) } : i));
    write(next);
  }, []);

  const removeItem = useCallback((key: string) => {
    write(read().filter((i) => i.key !== key));
  }, []);

  const clear = useCallback(() => write([]), []);

  const count = items.reduce((s, i) => s + i.quantity, 0);
  const subtotal = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);

  return { items, addItem, updateQty, removeItem, clear, count, subtotal };
}
