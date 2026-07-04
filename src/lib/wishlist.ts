import { useEffect, useState } from "react";

const KEY = "wishlist";

export type WishlistItem = {
  id: string;
  name: string;
  price: number;
  sale_price: number | null;
  on_sale: boolean;
  image_url: string | null;
};

export function getWishlist(): WishlistItem[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { return []; }
}

export function toggleWishlist(item: WishlistItem): boolean {
  const list = getWishlist();
  const exists = list.some((i) => i.id === item.id);
  if (exists) {
    localStorage.setItem(KEY, JSON.stringify(list.filter((i) => i.id !== item.id)));
  } else {
    localStorage.setItem(KEY, JSON.stringify([item, ...list]));
  }
  window.dispatchEvent(new Event("wishlist-updated"));
  return !exists;
}

export function isWishlisted(id: string): boolean {
  return getWishlist().some((i) => i.id === id);
}

export function removeFromWishlist(id: string) {
  localStorage.setItem(KEY, JSON.stringify(getWishlist().filter((i) => i.id !== id)));
  window.dispatchEvent(new Event("wishlist-updated"));
}

export function useWishlistCount(): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    setCount(getWishlist().length);
    const handler = () => setCount(getWishlist().length);
    window.addEventListener("storage", handler);
    window.addEventListener("wishlist-updated", handler);
    return () => {
      window.removeEventListener("storage", handler);
      window.removeEventListener("wishlist-updated", handler);
    };
  }, []);
  return count;
}
