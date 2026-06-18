-- Bug: the previous version used IF/ELSIF, so a product with BOTH a color
-- and a size selected only ever checked/decremented the COLOR's stock —
-- the size's stock was completely ignored. In practice this meant: if a
-- color had no stock cap set (NULL = unlimited) but a specific size did
-- (e.g. size "L" capped at 5), checkout would let someone order 20 of that
-- size with no warning, and the order would go through uncapped.
--
-- Fix: check and decrement color and size independently. Both must have
-- enough stock (or be untracked) for the order to succeed. If one passes
-- and the other fails, the successful one is rolled back (compensated)
-- before returning false, so nothing is left half-decremented.
CREATE OR REPLACE FUNCTION public.decrement_stock(p_product_id uuid, p_color text, p_size text, p_quantity int)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  color_ok boolean := true;
  size_ok boolean := true;
  affected int;
BEGIN
  IF p_color IS NOT NULL THEN
    UPDATE public.product_colors
    SET stock_quantity = stock_quantity - p_quantity
    WHERE product_id = p_product_id AND name = p_color
      AND (stock_quantity IS NULL OR stock_quantity >= p_quantity);
    GET DIAGNOSTICS affected = ROW_COUNT;
    color_ok := affected > 0;
  END IF;

  IF color_ok AND p_size IS NOT NULL THEN
    UPDATE public.product_sizes
    SET stock_quantity = stock_quantity - p_quantity
    WHERE product_id = p_product_id AND name = p_size
      AND (stock_quantity IS NULL OR stock_quantity >= p_quantity);
    GET DIAGNOSTICS affected = ROW_COUNT;
    size_ok := affected > 0;
  END IF;

  IF NOT color_ok OR NOT size_ok THEN
    IF color_ok AND p_color IS NOT NULL THEN
      UPDATE public.product_colors SET stock_quantity = stock_quantity + p_quantity
      WHERE product_id = p_product_id AND name = p_color;
    END IF;
    RETURN false;
  END IF;

  IF p_color IS NULL AND p_size IS NULL THEN
    UPDATE public.products
    SET stock_quantity = stock_quantity - p_quantity
    WHERE id = p_product_id
      AND (stock_quantity IS NULL OR stock_quantity >= p_quantity);
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected = 0 THEN RETURN false; END IF;
  END IF;

  RETURN true;
END;
$$;
