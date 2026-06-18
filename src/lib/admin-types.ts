export type Product = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  sale_price: number | null;
  on_sale: boolean;
  image_url: string | null;
  whatsapp_number: string | null;
  weight: number;
  active: boolean;
  stock_quantity: number | null;
  category: string | null;
};

export type ProductColor = {
  id: string;
  product_id: string;
  name: string;
  hex: string;
  stock_quantity: number | null;
};
export type ProductSize = {
  id: string;
  product_id: string;
  name: string;
  stock_quantity: number | null;
  position: number;
};
export type ProductImage = { id: string; product_id: string; image_url: string; position: number };
export type Category = { id: string; name: string; position: number };

export type Order = {
  id: string;
  product_name: string;
  color: string | null;
  size: string | null;
  quantity: number;
  total: number;
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  status: string;
  pathao_consignment_id: string | null;
  pathao_status: string | null;
  created_at: string;
};

export type Faq = {
  id: string;
  question: string;
  answer: string;
  position: number;
  active: boolean;
};

export const STANDARD_SIZES = ["S", "M", "L", "XL", "XXL"];

export const STATUS_COLORS: Record<string, string> = {
  pending: "#f59e0b",
  submitted: "#3b82f6",
  shipped: "#8b5cf6",
  delivered: "#10b981",
  cancelled: "#ef4444",
};

export const statusVariant = (s: string): "default" | "secondary" | "destructive" | "outline" => {
  if (s === "delivered") return "default";
  if (s === "cancelled") return "destructive";
  if (s === "shipped" || s === "submitted") return "secondary";
  return "outline";
};
