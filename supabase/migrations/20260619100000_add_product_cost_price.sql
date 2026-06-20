-- Cost price (what you paid per unit) alongside the existing price/sale_price
-- (what you charge). Nullable like stock_quantity: existing products simply
-- don't show a margin until an admin fills this in, rather than defaulting
-- to 0 and making every product look like 100% margin.
ALTER TABLE public.products ADD COLUMN cost_price NUMERIC(10,2);
ALTER TABLE public.products ADD CONSTRAINT products_cost_price_check CHECK (cost_price IS NULL OR cost_price >= 0);
