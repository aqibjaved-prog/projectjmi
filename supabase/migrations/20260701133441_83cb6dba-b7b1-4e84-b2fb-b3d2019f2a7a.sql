
-- 1. Columns
ALTER TABLE public.routes
  ADD COLUMN IF NOT EXISTS route_code text,
  ADD COLUMN IF NOT EXISTS route_type text NOT NULL DEFAULT 'both',
  ADD COLUMN IF NOT EXISTS starting_point text,
  ADD COLUMN IF NOT EXISTS ending_point text,
  ADD COLUMN IF NOT EXISTS start_lat double precision,
  ADD COLUMN IF NOT EXISTS start_lng double precision,
  ADD COLUMN IF NOT EXISTS end_lat double precision,
  ADD COLUMN IF NOT EXISTS end_lng double precision,
  ADD COLUMN IF NOT EXISTS total_distance numeric,
  ADD COLUMN IF NOT EXISTS estimated_duration integer,
  ADD COLUMN IF NOT EXISTS max_students integer,
  ADD COLUMN IF NOT EXISTS route_color text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Route type check via trigger to allow future values without CHECK migration pain
CREATE OR REPLACE FUNCTION public.routes_validate_type()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.route_type NOT IN ('morning','afternoon','both') THEN
    RAISE EXCEPTION 'Invalid route_type: %', NEW.route_type USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_routes_validate_type ON public.routes;
CREATE TRIGGER trg_routes_validate_type
BEFORE INSERT OR UPDATE ON public.routes
FOR EACH ROW EXECUTE FUNCTION public.routes_validate_type();

-- 2. Auto route_code sequential per school
CREATE OR REPLACE FUNCTION public.routes_before_insert()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE next_num int;
BEGIN
  IF (NEW.route_code IS NULL OR btrim(NEW.route_code) = '') THEN
    SELECT COALESCE(MAX(NULLIF(regexp_replace(route_code, '\D', '', 'g'), '')::int), 0) + 1
      INTO next_num FROM public.routes
      WHERE school_id = NEW.school_id AND route_code IS NOT NULL;
    NEW.route_code := 'RTE-' || LPAD(next_num::text, 5, '0');
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_routes_before_insert ON public.routes;
CREATE TRIGGER trg_routes_before_insert
BEFORE INSERT ON public.routes
FOR EACH ROW EXECUTE FUNCTION public.routes_before_insert();

-- 3. Unique driver/vehicle per active route (per school)
CREATE UNIQUE INDEX IF NOT EXISTS routes_unique_active_driver
  ON public.routes(school_id, driver_id)
  WHERE is_active = true AND driver_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS routes_unique_active_vehicle
  ON public.routes(school_id, vehicle_id)
  WHERE is_active = true AND vehicle_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS routes_school_code_uniq
  ON public.routes(school_id, route_code)
  WHERE route_code IS NOT NULL;

-- 4. Route capacity enforcement on students
CREATE OR REPLACE FUNCTION public.students_check_route_capacity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  mx int;
  used int;
BEGIN
  IF NEW.route_id IS NULL OR COALESCE(NEW.is_active, true) = false THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND NEW.route_id IS NOT DISTINCT FROM OLD.route_id
     AND NEW.is_active IS NOT DISTINCT FROM OLD.is_active THEN
    RETURN NEW;
  END IF;

  SELECT max_students INTO mx FROM public.routes WHERE id = NEW.route_id;
  IF mx IS NULL OR mx <= 0 THEN RETURN NEW; END IF;

  SELECT COUNT(*) INTO used
    FROM public.students
   WHERE route_id = NEW.route_id
     AND is_active = true
     AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

  IF used + 1 > mx THEN
    RAISE EXCEPTION 'Route has reached its maximum student capacity.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_students_route_capacity ON public.students;
CREATE TRIGGER trg_students_route_capacity
BEFORE INSERT OR UPDATE ON public.students
FOR EACH ROW EXECUTE FUNCTION public.students_check_route_capacity();
