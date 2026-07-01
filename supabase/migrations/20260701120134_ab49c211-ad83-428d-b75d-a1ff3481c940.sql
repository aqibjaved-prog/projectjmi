
-- Helper: return effective limits from active subscription's plan for a school
CREATE OR REPLACE FUNCTION public.school_plan_limits(_school_id uuid)
RETURNS TABLE(student_limit int, vehicle_limit int, plan_code text, plan_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.student_limit, p.vehicle_limit, p.code, p.name
    FROM public.subscriptions s
    JOIN public.subscription_plans p ON p.id = s.plan_id
   WHERE s.school_id = _school_id
     AND s.status IN ('active','trialing')
   ORDER BY s.updated_at DESC
   LIMIT 1;
$$;

-- Usage report per school (for dashboards)
CREATE OR REPLACE FUNCTION public.school_plan_usage(_school_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  lim record;
  students_used int;
  vehicles_used int;
  drivers_used int;
  routes_used int;
  parents_used int;
BEGIN
  SELECT * INTO lim FROM public.school_plan_limits(_school_id);
  SELECT count(*) INTO students_used FROM public.students WHERE school_id = _school_id AND is_active = true;
  SELECT count(*) INTO vehicles_used FROM public.vehicles WHERE school_id = _school_id;
  SELECT count(*) INTO drivers_used FROM public.drivers WHERE school_id = _school_id AND is_active = true;
  SELECT count(*) INTO routes_used FROM public.routes WHERE school_id = _school_id AND is_active = true;
  SELECT count(*) INTO parents_used FROM public.parents WHERE school_id = _school_id;
  RETURN jsonb_build_object(
    'plan_code', lim.plan_code,
    'plan_name', lim.plan_name,
    'students', jsonb_build_object('used', students_used, 'limit', lim.student_limit),
    'vehicles', jsonb_build_object('used', vehicles_used, 'limit', lim.vehicle_limit),
    'drivers',  jsonb_build_object('used', drivers_used,  'limit', NULL),
    'routes',   jsonb_build_object('used', routes_used,   'limit', NULL),
    'parents',  jsonb_build_object('used', parents_used,  'limit', NULL)
  );
END; $$;

GRANT EXECUTE ON FUNCTION public.school_plan_limits(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.school_plan_usage(uuid) TO authenticated, service_role;

-- Students: enforce student limit
CREATE OR REPLACE FUNCTION public.students_check_plan_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  lim int;
  used int;
BEGIN
  -- Only enforce when the row is (becoming) active
  IF COALESCE(NEW.is_active, true) = false THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE'
     AND OLD.is_active = true
     AND NEW.is_active = true
     AND NEW.school_id = OLD.school_id THEN
    RETURN NEW;
  END IF;

  SELECT student_limit INTO lim FROM public.school_plan_limits(NEW.school_id);
  IF lim IS NULL THEN RETURN NEW; END IF; -- unlimited or no plan configured

  SELECT count(*) INTO used
    FROM public.students
   WHERE school_id = NEW.school_id
     AND is_active = true
     AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

  IF used + 1 > lim THEN
    RAISE EXCEPTION 'PLAN_LIMIT_STUDENTS: You have reached the maximum number of students allowed by your current subscription plan. Upgrade your subscription to add more students.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_students_plan_limit ON public.students;
CREATE TRIGGER trg_students_plan_limit
BEFORE INSERT OR UPDATE OF is_active, school_id ON public.students
FOR EACH ROW EXECUTE FUNCTION public.students_check_plan_limit();

-- Vehicles: enforce vehicle limit
CREATE OR REPLACE FUNCTION public.vehicles_check_plan_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  lim int;
  used int;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.school_id = OLD.school_id THEN RETURN NEW; END IF;

  SELECT vehicle_limit INTO lim FROM public.school_plan_limits(NEW.school_id);
  IF lim IS NULL THEN RETURN NEW; END IF;

  SELECT count(*) INTO used
    FROM public.vehicles
   WHERE school_id = NEW.school_id
     AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

  IF used + 1 > lim THEN
    RAISE EXCEPTION 'PLAN_LIMIT_VEHICLES: Vehicle limit reached for your current subscription.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_vehicles_plan_limit ON public.vehicles;
CREATE TRIGGER trg_vehicles_plan_limit
BEFORE INSERT OR UPDATE OF school_id ON public.vehicles
FOR EACH ROW EXECUTE FUNCTION public.vehicles_check_plan_limit();
