
-- Extend vehicles for full management module
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS vehicle_code text;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS vehicle_number text;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

CREATE UNIQUE INDEX IF NOT EXISTS vehicles_school_code_uidx
  ON public.vehicles (school_id, vehicle_code) WHERE vehicle_code IS NOT NULL;

-- Auto vehicle_code trigger (sequential per school: VEH-00001)
CREATE OR REPLACE FUNCTION public.vehicles_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE next_num integer;
BEGIN
  IF (NEW.vehicle_code IS NULL OR btrim(NEW.vehicle_code) = '') THEN
    SELECT COALESCE(MAX(NULLIF(regexp_replace(vehicle_code, '\D', '', 'g'), '')::int), 0) + 1
      INTO next_num FROM public.vehicles
      WHERE school_id = NEW.school_id AND vehicle_code IS NOT NULL;
    NEW.vehicle_code := 'VEH-' || LPAD(next_num::text, 5, '0');
  END IF;
  IF NEW.status IS NULL OR btrim(NEW.status) = '' THEN NEW.status := 'active'; END IF;
  -- keep is_active roughly in sync with status
  NEW.is_active := (NEW.status = 'active');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vehicles_before_insert ON public.vehicles;
CREATE TRIGGER trg_vehicles_before_insert
  BEFORE INSERT ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION public.vehicles_before_insert();

CREATE OR REPLACE FUNCTION public.vehicles_before_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.is_active := (NEW.status = 'active');
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vehicles_before_update ON public.vehicles;
CREATE TRIGGER trg_vehicles_before_update
  BEFORE UPDATE ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION public.vehicles_before_update();
