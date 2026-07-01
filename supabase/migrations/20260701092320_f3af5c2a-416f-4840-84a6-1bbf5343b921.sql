
-- Allow Super Admins to manage user_roles (needed for School Admin Management)
CREATE POLICY "Super admins manage user roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

-- Unique constraint safety (prevents dup role rows per user+role+school)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_roles_user_role_school_unique'
  ) THEN
    ALTER TABLE public.user_roles
      ADD CONSTRAINT user_roles_user_role_school_unique
      UNIQUE (user_id, role, school_id);
  END IF;
END $$;
