
-- Extend trip enums (new values become usable after commit)
ALTER TYPE public.trip_status ADD VALUE IF NOT EXISTS 'ready';
ALTER TYPE public.trip_status ADD VALUE IF NOT EXISTS 'paused';
ALTER TYPE public.trip_type ADD VALUE IF NOT EXISTS 'special';
ALTER TYPE public.trip_type ADD VALUE IF NOT EXISTS 'emergency';

-- Extend trips table with fields required by Trip Management module
ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS expected_start_time time,
  ADD COLUMN IF NOT EXISTS expected_end_time time,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS canceled_at timestamptz,
  ADD COLUMN IF NOT EXISTS stop_progress jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS timeline jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS live_location jsonb,
  ADD COLUMN IF NOT EXISTS snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS trip_code text;

-- Auto-generate a trip_code per school
CREATE OR REPLACE FUNCTION public.trips_before_insert()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE next_num int;
BEGIN
  IF (NEW.trip_code IS NULL OR btrim(NEW.trip_code) = '') THEN
    SELECT COALESCE(MAX(NULLIF(regexp_replace(trip_code, '\D', '', 'g'), '')::int), 0) + 1
      INTO next_num FROM public.trips
      WHERE school_id = NEW.school_id AND trip_code IS NOT NULL;
    NEW.trip_code := 'TRP-' || LPAD(next_num::text, 5, '0');
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_trips_before_insert ON public.trips;
CREATE TRIGGER trg_trips_before_insert BEFORE INSERT ON public.trips
  FOR EACH ROW EXECUTE FUNCTION public.trips_before_insert();

CREATE INDEX IF NOT EXISTS idx_trips_status ON public.trips(status);
CREATE INDEX IF NOT EXISTS idx_trips_school_status_date ON public.trips(school_id, status, trip_date DESC);
