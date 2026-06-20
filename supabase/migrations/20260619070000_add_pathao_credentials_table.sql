-- Stores Pathao Merchant API credentials so the admin can switch from
-- sandbox to production without redeploying or setting environment
-- variables. This table holds secrets (client_secret, password) and must
-- NEVER be readable by anon/authenticated clients — only the server
-- (service_role) reads it, via supabaseAdmin in pathao.server.ts.
CREATE TABLE public.pathao_credentials (
  id INT PRIMARY KEY DEFAULT 1,
  base_url TEXT,
  client_id TEXT,
  client_secret TEXT,
  username TEXT,
  password TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT pathao_credentials_singleton CHECK (id = 1)
);

GRANT ALL ON public.pathao_credentials TO service_role;
ALTER TABLE public.pathao_credentials ENABLE ROW LEVEL SECURITY;

-- Explicit deny-all for anon/authenticated so RLS lint sees a policy and
-- so the secrets can only ever be reached through admin-gated server
-- functions that use the service-role client, never a direct client query.
CREATE POLICY "no client access to pathao credentials" ON public.pathao_credentials
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

-- Changing credentials invalidates any cached token from the old account,
-- otherwise pathao.server.ts would keep using a token tied to the
-- previous client_id/secret until it naturally expired.
CREATE OR REPLACE FUNCTION public.invalidate_pathao_token_on_credential_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.pathao_tokens WHERE id = 1;
  RETURN NEW;
END;
$$;

CREATE TRIGGER pathao_credentials_invalidate_token
AFTER INSERT OR UPDATE ON public.pathao_credentials
FOR EACH ROW EXECUTE FUNCTION public.invalidate_pathao_token_on_credential_change();
