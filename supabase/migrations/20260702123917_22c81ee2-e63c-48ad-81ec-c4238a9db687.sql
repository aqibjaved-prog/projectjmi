
ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid;

CREATE INDEX IF NOT EXISTS idx_drivers_deleted_at ON public.drivers(deleted_at);
