-- Separate from the admin's own manual `status` workflow field. This holds
-- the last-synced order_status_slug pulled live from Pathao's
-- /orders/{consignment_id}/info endpoint, so the admin's manual status
-- and Pathao's own status are never overwriting each other.
ALTER TABLE public.orders ADD COLUMN pathao_status TEXT;
