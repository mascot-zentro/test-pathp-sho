-- Lets the admin tag where an order came from. Normal checkout orders stay
-- 'website' (the default); orders the admin types in by hand for a sale
-- that happened on Instagram or TikTok DMs get tagged accordingly, so
-- reporting can separate organic website orders from social-media sales.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'website';

ALTER TABLE public.orders
  ADD CONSTRAINT orders_source_check CHECK (source IN ('website', 'instagram', 'tiktok', 'facebook', 'whatsapp', 'manual'));

CREATE INDEX IF NOT EXISTS orders_source_idx ON public.orders (source);
