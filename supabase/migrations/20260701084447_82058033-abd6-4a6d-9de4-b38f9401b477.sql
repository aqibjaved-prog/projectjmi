
-- 1. Add new columns to students
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS student_code text,
  ADD COLUMN IF NOT EXISTS admission_number text,
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS blood_group text,
  ADD COLUMN IF NOT EXISTS parent_name text,
  ADD COLUMN IF NOT EXISTS parent_phone text,
  ADD COLUMN IF NOT EXISTS parent_email text,
  ADD COLUMN IF NOT EXISTS emergency_contact text,
  ADD COLUMN IF NOT EXISTS pickup_lat double precision,
  ADD COLUMN IF NOT EXISTS pickup_lng double precision,
  ADD COLUMN IF NOT EXISTS drop_lat double precision,
  ADD COLUMN IF NOT EXISTS drop_lng double precision;

-- unique admission per school (only when set)
CREATE UNIQUE INDEX IF NOT EXISTS students_school_admission_uniq
  ON public.students(school_id, admission_number)
  WHERE admission_number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS students_school_code_uniq
  ON public.students(school_id, student_code)
  WHERE student_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_students_vehicle ON public.students(vehicle_id);

-- 2. Trigger to auto-fill student_code, qr_code, and full_name
CREATE OR REPLACE FUNCTION public.students_before_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  next_num integer;
BEGIN
  -- Compose full_name from first/last if not provided
  IF (NEW.full_name IS NULL OR btrim(NEW.full_name) = '') THEN
    NEW.full_name := btrim(coalesce(NEW.first_name, '') || ' ' || coalesce(NEW.last_name, ''));
    IF NEW.full_name = '' THEN
      NEW.full_name := 'Unnamed';
    END IF;
  END IF;

  -- Auto QR code
  IF (NEW.qr_code IS NULL OR btrim(NEW.qr_code) = '') THEN
    NEW.qr_code := 'SVG-' || replace(gen_random_uuid()::text, '-', '');
  END IF;

  -- Auto student_code sequential per school
  IF (NEW.student_code IS NULL OR btrim(NEW.student_code) = '') THEN
    SELECT COALESCE(MAX(NULLIF(regexp_replace(student_code, '\D', '', 'g'), '')::int), 0) + 1
      INTO next_num
      FROM public.students
     WHERE school_id = NEW.school_id
       AND student_code IS NOT NULL;
    NEW.student_code := 'STU-' || LPAD(next_num::text, 5, '0');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_students_before_insert ON public.students;
CREATE TRIGGER trg_students_before_insert
  BEFORE INSERT ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.students_before_insert();

-- Also keep full_name synced on update when first/last changes and full_name is blank
CREATE OR REPLACE FUNCTION public.students_before_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (NEW.full_name IS NULL OR btrim(NEW.full_name) = '') THEN
    NEW.full_name := btrim(coalesce(NEW.first_name, '') || ' ' || coalesce(NEW.last_name, ''));
    IF NEW.full_name = '' THEN NEW.full_name := 'Unnamed'; END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_students_before_update ON public.students;
CREATE TRIGGER trg_students_before_update
  BEFORE UPDATE ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.students_before_update();

-- 3. Backfill student_code for existing rows
DO $$
DECLARE
  r record;
  n integer;
BEGIN
  FOR r IN SELECT id, school_id FROM public.students WHERE student_code IS NULL ORDER BY school_id, created_at LOOP
    SELECT COALESCE(MAX(NULLIF(regexp_replace(student_code, '\D', '', 'g'), '')::int), 0) + 1
      INTO n
      FROM public.students
     WHERE school_id = r.school_id AND student_code IS NOT NULL;
    UPDATE public.students SET student_code = 'STU-' || LPAD(n::text, 5, '0') WHERE id = r.id;
  END LOOP;
END $$;

-- Backfill qr_code where null
UPDATE public.students
   SET qr_code = 'SVG-' || replace(gen_random_uuid()::text, '-', '')
 WHERE qr_code IS NULL OR btrim(qr_code) = '';

-- 4. Storage RLS for student-photos bucket
-- Path convention: <school_id>/<student_id>/<filename>
DROP POLICY IF EXISTS "student_photos_read" ON storage.objects;
CREATE POLICY "student_photos_read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'student-photos'
    AND (
      public.is_super_admin(auth.uid())
      OR public.user_belongs_to_school(auth.uid(), ((storage.foldername(name))[1])::uuid)
    )
  );

DROP POLICY IF EXISTS "student_photos_insert" ON storage.objects;
CREATE POLICY "student_photos_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'student-photos'
    AND (
      public.is_super_admin(auth.uid())
      OR public.is_school_admin_of(auth.uid(), ((storage.foldername(name))[1])::uuid)
    )
  );

DROP POLICY IF EXISTS "student_photos_update" ON storage.objects;
CREATE POLICY "student_photos_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'student-photos'
    AND (
      public.is_super_admin(auth.uid())
      OR public.is_school_admin_of(auth.uid(), ((storage.foldername(name))[1])::uuid)
    )
  );

DROP POLICY IF EXISTS "student_photos_delete" ON storage.objects;
CREATE POLICY "student_photos_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'student-photos'
    AND (
      public.is_super_admin(auth.uid())
      OR public.is_school_admin_of(auth.uid(), ((storage.foldername(name))[1])::uuid)
    )
  );
