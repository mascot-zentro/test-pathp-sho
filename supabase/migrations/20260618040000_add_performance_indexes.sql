-- Postgres does not auto-index foreign key columns (only primary keys).
-- These cover the joins/filters/sorts already used throughout the app
-- (admin dashboard order list, storefront product grid, variant lookups,
-- and the new order-rate-limit check by phone).
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_product_id ON public.orders (product_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer_phone ON public.orders (customer_phone);

CREATE INDEX IF NOT EXISTS idx_products_active ON public.products (active);
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products (category);

CREATE INDEX IF NOT EXISTS idx_product_colors_product_id ON public.product_colors (product_id);
CREATE INDEX IF NOT EXISTS idx_product_images_product_id ON public.product_images (product_id);
CREATE INDEX IF NOT EXISTS idx_product_sizes_product_id ON public.product_sizes (product_id);
