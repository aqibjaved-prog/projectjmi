
CREATE OR REPLACE FUNCTION public.link_parent_by_phone()
RETURNS TABLE(linked_children int, schools int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  jwt_phone text;
  norm text;
  s_rec record;
  parent_row_id uuid;
  child_count int := 0;
  school_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT COALESCE(
    NULLIF(auth.jwt() ->> 'phone', ''),
    (SELECT phone FROM auth.users WHERE id = uid)
  ) INTO jwt_phone;

  norm := public.normalize_phone(jwt_phone);
  IF norm IS NULL OR length(norm) < 6 THEN
    RETURN QUERY SELECT 0, 0;
    RETURN;
  END IF;

  FOR s_rec IN
    SELECT DISTINCT school_id,
           first_value(COALESCE(NULLIF(btrim(parent_name),''), 'Parent'))
             OVER (PARTITION BY school_id ORDER BY created_at) AS parent_name
      FROM public.students
     WHERE parent_phone_normalized = norm
       AND is_active = true
  LOOP
    -- Prefer a row already owned by this user in this school; otherwise reuse a phone-matched row.
    SELECT id INTO parent_row_id
      FROM public.parents
     WHERE school_id = s_rec.school_id
       AND user_id = uid
     LIMIT 1;

    IF parent_row_id IS NULL THEN
      SELECT id INTO parent_row_id
        FROM public.parents
       WHERE school_id = s_rec.school_id
         AND phone_normalized = norm
       ORDER BY (user_id IS NULL) DESC, created_at ASC
       LIMIT 1;
    END IF;

    IF parent_row_id IS NULL THEN
      INSERT INTO public.parents (school_id, user_id, full_name, phone)
      VALUES (s_rec.school_id, uid, s_rec.parent_name, jwt_phone)
      RETURNING id INTO parent_row_id;
    ELSE
      UPDATE public.parents
         SET user_id = uid, -- phone is OTP-verified; caller is the true owner
             phone   = COALESCE(phone, jwt_phone),
             full_name = CASE
               WHEN full_name IS NULL OR full_name = '' OR full_name = 'Unnamed'
                 THEN s_rec.parent_name ELSE full_name
             END,
             updated_at = now()
       WHERE id = parent_row_id;
    END IF;

    UPDATE public.students
       SET parent_id = parent_row_id
     WHERE school_id = s_rec.school_id
       AND parent_phone_normalized = norm
       AND parent_id IS DISTINCT FROM parent_row_id;

    INSERT INTO public.user_roles (user_id, role, school_id)
    VALUES (uid, 'parent', s_rec.school_id)
    ON CONFLICT (user_id, role, school_id) DO NOTHING;

    school_ids := array_append(school_ids, s_rec.school_id);
  END LOOP;

  SELECT count(*) INTO child_count
    FROM public.students
   WHERE parent_phone_normalized = norm AND is_active = true;

  RETURN QUERY SELECT child_count, COALESCE(array_length(school_ids, 1), 0);
END;
$$;

REVOKE ALL ON FUNCTION public.link_parent_by_phone() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_parent_by_phone() TO authenticated;
