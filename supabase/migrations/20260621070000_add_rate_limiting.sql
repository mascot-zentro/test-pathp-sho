-- Generic rate-limit backing store, shared by any public server function
-- that needs one (page-visit logging, promo-code lookups, Pathao
-- city/zone/area + delivery-fee lookups, order creation, etc).
--
-- Why a DB table instead of an in-memory counter: this app runs as
-- stateless Vercel serverless functions, which can scale to many
-- concurrent instances with no shared memory between them. An in-process
-- Map would only rate-limit requests that happen to land on the same
-- warm instance — easily bypassed at any real scale. A single atomic
-- Postgres function gives one consistent counter regardless of which
-- instance handles the request.
CREATE TABLE public.rate_limit_hits (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Supports the per-key window scan inside check_rate_limit below.
CREATE INDEX idx_rate_limit_hits_key_created_at ON public.rate_limit_hits (key, created_at);

GRANT ALL ON public.rate_limit_hits TO service_role;
ALTER TABLE public.rate_limit_hits ENABLE ROW LEVEL SECURITY;

-- No anon/authenticated access at all — this table is only ever touched
-- through check_rate_limit() (service-role / SECURITY DEFINER), never
-- read or written directly from the browser.
CREATE POLICY "no client access to rate_limit_hits" ON public.rate_limit_hits
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

-- Atomically checks whether `p_key` is still under `p_max_hits` within the
-- trailing `p_window_seconds`, and if so records this attempt and returns
-- true. Row-locking the key's rows for the duration of the check (FOR
-- UPDATE) means two concurrent requests for the same key can't both read
-- "count = max - 1" and both get waved through.
--
-- Also does a small amount of opportunistic cleanup (1% of calls, capped
-- at 500 rows) so the table doesn't grow unbounded without needing a
-- separate cron job.
CREATE OR REPLACE FUNCTION public.check_rate_limit(p_key text, p_max_hits int, p_window_seconds int)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  -- Serializes concurrent calls for the same key for the rest of this
  -- transaction (released automatically on commit) — `FOR UPDATE` can't be
  -- used on an aggregate query, so this is how the count-then-insert below
  -- stays race-free under concurrent requests for the same key.
  PERFORM pg_advisory_xact_lock(hashtext(p_key));

  IF random() < 0.01 THEN
    DELETE FROM public.rate_limit_hits
    WHERE id IN (
      SELECT id FROM public.rate_limit_hits
      WHERE created_at < now() - interval '1 day'
      LIMIT 500
    );
  END IF;

  SELECT count(*) INTO v_count
  FROM public.rate_limit_hits
  WHERE key = p_key AND created_at >= now() - (p_window_seconds || ' seconds')::interval;

  IF v_count >= p_max_hits THEN
    RETURN false;
  END IF;

  INSERT INTO public.rate_limit_hits (key) VALUES (p_key);
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, int, int) TO service_role;
