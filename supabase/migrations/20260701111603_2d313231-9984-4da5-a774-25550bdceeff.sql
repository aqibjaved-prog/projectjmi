
-- Trigger: enforce vehicle seating capacity when assigning students
CREATE OR REPLACE FUNCTION public.students_check_vehicle_capacity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cap int;
  occ int;
BEGIN
  IF NEW.vehicle_id IS NULL OR COALESCE(NEW.is_active, true) = false THEN
    RETURN NEW;
  END IF;

  -- Only re-check if this insert/update actually changes assignment or activation
  IF TG_OP = 'UPDATE'
     AND NEW.vehicle_id IS NOT DISTINCT FROM OLD.vehicle_id
     AND NEW.is_active IS NOT DISTINCT FROM OLD.is_active THEN
    RETURN NEW;
  END IF;

  SELECT capacity INTO cap FROM public.vehicles WHERE id = NEW.vehicle_id;
  IF cap IS NULL OR cap <= 0 THEN
    RAISE EXCEPTION 'This vehicle has reached its maximum seating capacity.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT COUNT(*) INTO occ
    FROM public.students
   WHERE vehicle_id = NEW.vehicle_id
     AND is_active = true
     AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

  IF occ + 1 > cap THEN
    RAISE EXCEPTION 'This vehicle has reached its maximum seating capacity.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS students_check_vehicle_capacity_ins ON public.students;
CREATE TRIGGER students_check_vehicle_capacity_ins
BEFORE INSERT ON public.students
FOR EACH ROW EXECUTE FUNCTION public.students_check_vehicle_capacity();

DROP TRIGGER IF EXISTS students_check_vehicle_capacity_upd ON public.students;
CREATE TRIGGER students_check_vehicle_capacity_upd
BEFORE UPDATE OF vehicle_id, is_active ON public.students
FOR EACH ROW EXECUTE FUNCTION public.students_check_vehicle_capacity();

-- Occupancy view (RLS: security_invoker so it respects the caller's access to vehicles)
CREATE OR REPLACE VIEW public.vehicle_occupancy
WITH (security_invoker = true) AS
SELECT
  v.id AS vehicle_id,
  v.school_id,
  v.capacity,
  COALESCE(s.occupied, 0)::int AS occupied,
  GREATEST(v.capacity - COALESCE(s.occupied, 0), 0)::int AS available
FROM public.vehicles v
LEFT JOIN (
  SELECT vehicle_id, COUNT(*)::int AS occupied
  FROM public.students
  WHERE vehicle_id IS NOT NULL AND is_active = true
  GROUP BY vehicle_id
) s ON s.vehicle_id = v.id;

GRANT SELECT ON public.vehicle_occupancy TO authenticated;
GRANT ALL ON public.vehicle_occupancy TO service_role;
