-- NULL stock_quantity means "untracked / unlimited" so existing live products are unaffected.
-- Setting an actual number opts a product/color into stock tracking and checkout blocking.
ALTER TABLE public.products ADD COLUMN stock_quantity INT;
ALTER TABLE public.products ADD CONSTRAINT products_stock_quantity_check CHECK (stock_quantity IS NULL OR stock_quantity >= 0);

ALTER TABLE public.product_colors ADD COLUMN stock_quantity INT;
ALTER TABLE public.product_colors ADD CONSTRAINT product_colors_stock_quantity_check CHECK (stock_quantity IS NULL OR stock_quantity >= 0);

-- Atomically checks and decrements stock at order time. Returns false (and changes nothing)
-- if the requested quantity isn't available, so callers can block the order.
CREATE OR REPLACE FUNCTION public.decrement_stock(p_product_id uuid, p_color text, p_quantity int)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected int;
BEGIN
  IF p_color IS NOT NULL THEN
    UPDATE public.product_colors
    SET stock_quantity = stock_quantity - p_quantity
    WHERE product_id = p_product_id AND name = p_color
      AND (stock_quantity IS NULL OR stock_quantity >= p_quantity);
    GET DIAGNOSTICS affected = ROW_COUNT;
  ELSE
    UPDATE public.products
    SET stock_quantity = stock_quantity - p_quantity
    WHERE id = p_product_id
      AND (stock_quantity IS NULL OR stock_quantity >= p_quantity);
    GET DIAGNOSTICS affected = ROW_COUNT;
  END IF;
  RETURN affected > 0;
END;
$$;
GRANT EXECUTE ON FUNCTION public.decrement_stock(uuid, text, int) TO service_role;
