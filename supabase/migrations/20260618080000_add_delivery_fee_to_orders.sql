-- Store the delivery fee quoted to the customer at checkout.
-- This is added to amount_to_collect when creating the Pathao consignment
-- so the courier collects subtotal + delivery from the customer on our behalf.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC(10,2) NOT NULL DEFAULT 0;
