
-- Revoke EXECUTE from PUBLIC and authenticated on SECURITY DEFINER functions
-- that are trigger-only or privileged helpers not meant to be called directly.
-- RLS helper functions (has_role, is_super_admin, is_school_admin_of,
-- user_belongs_to_school) must remain executable by authenticated because
-- they are referenced by RLS policies evaluated as the caller.

DO $$
DECLARE
  fn text;
  fns text[] := ARRAY[
    'handle_new_user()',
    'bootstrap_first_super_admin()',
    'vehicles_check_plan_limit()',
    'students_check_route_capacity()',
    'students_check_vehicle_capacity()',
    'students_check_plan_limit()',
    'school_plan_limits(uuid)',
    'school_plan_usage(uuid)'
  ];
BEGIN
  FOREACH fn IN ARRAY fns LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC', fn);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM authenticated', fn);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', fn);
  END LOOP;
END $$;
