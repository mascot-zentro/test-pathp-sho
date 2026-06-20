-- Simple page-visit log used for an admin "visits by location" pie chart.
-- One row per page load, with a coarse location (city/region/country)
-- derived from the Vercel geo headers on the request — no client-side
-- geolocation prompt, no third-party analytics script, no cookies.
CREATE TABLE public.page_visits (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  path TEXT NOT NULL,
  city TEXT,
  region TEXT,
  country TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX page_visits_created_at_idx ON public.page_visits (created_at);

-- Inserts happen only through the logPageVisit server function using the
-- service-role client, never directly from the browser, so anon/authenticated
-- get no INSERT grant at all. Only admins can read the data back (for the
-- dashboard chart) through an explicit SELECT policy.
GRANT ALL ON public.page_visits TO service_role;
ALTER TABLE public.page_visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin read page visits" ON public.page_visits
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "no client write page visits" ON public.page_visits
  FOR INSERT TO anon, authenticated WITH CHECK (false);
