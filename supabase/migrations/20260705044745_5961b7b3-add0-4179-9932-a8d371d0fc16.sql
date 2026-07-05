
CREATE TABLE IF NOT EXISTS public.dev_otp_codes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  phone text NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts int NOT NULL DEFAULT 0,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dev_otp_codes_phone_created_idx
  ON public.dev_otp_codes (phone, created_at DESC);

-- RLS enabled with NO policies: only service_role (server functions) can read/write.
GRANT ALL ON public.dev_otp_codes TO service_role;
ALTER TABLE public.dev_otp_codes ENABLE ROW LEVEL SECURITY;
