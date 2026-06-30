
-- =====================================================
-- ENUMS
-- =====================================================
CREATE TYPE public.app_role AS ENUM ('super_admin', 'school_admin', 'driver', 'parent');
CREATE TYPE public.school_status AS ENUM ('active', 'suspended', 'pending');
CREATE TYPE public.subscription_status AS ENUM ('active', 'past_due', 'canceled', 'trialing');
CREATE TYPE public.trip_status AS ENUM ('scheduled', 'in_progress', 'completed', 'canceled');
CREATE TYPE public.trip_type AS ENUM ('pickup', 'drop');

-- =====================================================
-- updated_at helper
-- =====================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- =====================================================
-- SCHOOLS (tenants)
-- =====================================================
CREATE TABLE public.schools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  address TEXT,
  city TEXT,
  state TEXT,
  country TEXT,
  postal_code TEXT,
  phone TEXT,
  email TEXT,
  logo_url TEXT,
  status public.school_status NOT NULL DEFAULT 'active',
  timezone TEXT NOT NULL DEFAULT 'UTC',
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schools TO authenticated;
GRANT ALL ON public.schools TO service_role;
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_schools_updated BEFORE UPDATE ON public.schools FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =====================================================
-- PROFILES (one row per auth user)
-- =====================================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  phone TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =====================================================
-- USER_ROLES (role per user, scoped to school for non-super-admins)
-- =====================================================
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role, school_id)
);
CREATE INDEX idx_user_roles_user ON public.user_roles(user_id);
CREATE INDEX idx_user_roles_school ON public.user_roles(school_id);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- SECURITY DEFINER HELPERS (avoid RLS recursion)
-- =====================================================
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'super_admin');
$$;

-- Returns the school_id(s) the user belongs to (used for tenant isolation)
CREATE OR REPLACE FUNCTION public.user_belongs_to_school(_user_id UUID, _school_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND school_id = _school_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_school_admin_of(_user_id UUID, _school_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'school_admin' AND school_id = _school_id
  );
$$;

-- =====================================================
-- RLS: profiles
-- =====================================================
CREATE POLICY "Users can read own profile" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_super_admin(auth.uid()));
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

-- =====================================================
-- RLS: schools
-- =====================================================
CREATE POLICY "Super admins manage all schools" ON public.schools FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));
CREATE POLICY "School members can view their school" ON public.schools FOR SELECT TO authenticated
  USING (public.user_belongs_to_school(auth.uid(), id));
CREATE POLICY "School admins can update their school" ON public.schools FOR UPDATE TO authenticated
  USING (public.is_school_admin_of(auth.uid(), id))
  WITH CHECK (public.is_school_admin_of(auth.uid(), id));

-- =====================================================
-- RLS: user_roles
-- =====================================================
CREATE POLICY "Users can view their own roles" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_super_admin(auth.uid())
         OR public.is_school_admin_of(auth.uid(), school_id));

-- =====================================================
-- VEHICLES
-- =====================================================
CREATE TABLE public.vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  registration_number TEXT NOT NULL,
  model TEXT,
  capacity INT NOT NULL DEFAULT 0,
  color TEXT,
  insurance_expiry DATE,
  fitness_expiry DATE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, registration_number)
);
CREATE INDEX idx_vehicles_school ON public.vehicles(school_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicles TO authenticated;
GRANT ALL ON public.vehicles TO service_role;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_vehicles_updated BEFORE UPDATE ON public.vehicles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE POLICY "Tenant access vehicles" ON public.vehicles FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.user_belongs_to_school(auth.uid(), school_id))
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.is_school_admin_of(auth.uid(), school_id));

-- =====================================================
-- DRIVERS
-- =====================================================
CREATE TABLE public.drivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  license_number TEXT,
  license_expiry DATE,
  assigned_vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_drivers_school ON public.drivers(school_id);
CREATE INDEX idx_drivers_user ON public.drivers(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.drivers TO authenticated;
GRANT ALL ON public.drivers TO service_role;
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_drivers_updated BEFORE UPDATE ON public.drivers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE POLICY "Drivers tenant access" ON public.drivers FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid())
         OR public.user_belongs_to_school(auth.uid(), school_id)
         OR user_id = auth.uid());
CREATE POLICY "School admin manage drivers" ON public.drivers FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.is_school_admin_of(auth.uid(), school_id))
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.is_school_admin_of(auth.uid(), school_id));

-- =====================================================
-- ROUTES
-- =====================================================
CREATE TABLE public.routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
  driver_id UUID REFERENCES public.drivers(id) ON DELETE SET NULL,
  pickup_start_time TIME,
  drop_start_time TIME,
  stops JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_routes_school ON public.routes(school_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.routes TO authenticated;
GRANT ALL ON public.routes TO service_role;
ALTER TABLE public.routes ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_routes_updated BEFORE UPDATE ON public.routes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE POLICY "Routes tenant read" ON public.routes FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.user_belongs_to_school(auth.uid(), school_id));
CREATE POLICY "School admin manage routes" ON public.routes FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.is_school_admin_of(auth.uid(), school_id))
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.is_school_admin_of(auth.uid(), school_id));

-- =====================================================
-- PARENTS
-- =====================================================
CREATE TABLE public.parents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_parents_school ON public.parents(school_id);
CREATE INDEX idx_parents_user ON public.parents(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.parents TO authenticated;
GRANT ALL ON public.parents TO service_role;
ALTER TABLE public.parents ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_parents_updated BEFORE UPDATE ON public.parents FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE POLICY "Parents tenant read" ON public.parents FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid())
         OR public.is_school_admin_of(auth.uid(), school_id)
         OR user_id = auth.uid());
CREATE POLICY "School admin manage parents" ON public.parents FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.is_school_admin_of(auth.uid(), school_id))
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.is_school_admin_of(auth.uid(), school_id));

-- =====================================================
-- STUDENTS
-- =====================================================
CREATE TABLE public.students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.parents(id) ON DELETE SET NULL,
  route_id UUID REFERENCES public.routes(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  grade TEXT,
  class_section TEXT,
  roll_number TEXT,
  qr_code TEXT UNIQUE,
  pickup_address TEXT,
  drop_address TEXT,
  photo_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_students_school ON public.students(school_id);
CREATE INDEX idx_students_parent ON public.students(parent_id);
CREATE INDEX idx_students_route ON public.students(route_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.students TO authenticated;
GRANT ALL ON public.students TO service_role;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_students_updated BEFORE UPDATE ON public.students FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE POLICY "Students tenant read" ON public.students FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.is_school_admin_of(auth.uid(), school_id)
    OR EXISTS (SELECT 1 FROM public.parents p WHERE p.id = parent_id AND p.user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.drivers d
      JOIN public.routes r ON r.driver_id = d.id
      WHERE d.user_id = auth.uid() AND r.id = route_id
    )
  );
CREATE POLICY "School admin manage students" ON public.students FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.is_school_admin_of(auth.uid(), school_id))
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.is_school_admin_of(auth.uid(), school_id));

-- =====================================================
-- TRIPS
-- =====================================================
CREATE TABLE public.trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  route_id UUID NOT NULL REFERENCES public.routes(id) ON DELETE CASCADE,
  vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
  driver_id UUID REFERENCES public.drivers(id) ON DELETE SET NULL,
  trip_date DATE NOT NULL DEFAULT CURRENT_DATE,
  trip_type public.trip_type NOT NULL,
  status public.trip_status NOT NULL DEFAULT 'scheduled',
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  start_location JSONB,
  end_location JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_trips_school_date ON public.trips(school_id, trip_date);
CREATE INDEX idx_trips_route ON public.trips(route_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trips TO authenticated;
GRANT ALL ON public.trips TO service_role;
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_trips_updated BEFORE UPDATE ON public.trips FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE POLICY "Trips tenant read" ON public.trips FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.is_school_admin_of(auth.uid(), school_id)
    OR EXISTS (SELECT 1 FROM public.drivers d WHERE d.id = driver_id AND d.user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.students s
      JOIN public.parents p ON p.id = s.parent_id
      WHERE s.route_id = trips.route_id AND p.user_id = auth.uid()
    )
  );
CREATE POLICY "Trips driver/admin write" ON public.trips FOR ALL TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.is_school_admin_of(auth.uid(), school_id)
    OR EXISTS (SELECT 1 FROM public.drivers d WHERE d.id = driver_id AND d.user_id = auth.uid())
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR public.is_school_admin_of(auth.uid(), school_id)
    OR EXISTS (SELECT 1 FROM public.drivers d WHERE d.id = driver_id AND d.user_id = auth.uid())
  );

-- =====================================================
-- QR LOGS
-- =====================================================
CREATE TABLE public.qr_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  trip_id UUID REFERENCES public.trips(id) ON DELETE SET NULL,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  driver_id UUID REFERENCES public.drivers(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  location JSONB,
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_qr_logs_school ON public.qr_logs(school_id, scanned_at DESC);
CREATE INDEX idx_qr_logs_student ON public.qr_logs(student_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.qr_logs TO authenticated;
GRANT ALL ON public.qr_logs TO service_role;
ALTER TABLE public.qr_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "QR logs tenant read" ON public.qr_logs FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.is_school_admin_of(auth.uid(), school_id)
    OR EXISTS (SELECT 1 FROM public.drivers d WHERE d.id = driver_id AND d.user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.students s
      JOIN public.parents p ON p.id = s.parent_id
      WHERE s.id = student_id AND p.user_id = auth.uid()
    )
  );
CREATE POLICY "QR logs insert by driver/admin" ON public.qr_logs FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR public.is_school_admin_of(auth.uid(), school_id)
    OR EXISTS (SELECT 1 FROM public.drivers d WHERE d.id = driver_id AND d.user_id = auth.uid())
  );

-- =====================================================
-- SPEED LOGS
-- =====================================================
CREATE TABLE public.speed_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  trip_id UUID REFERENCES public.trips(id) ON DELETE CASCADE,
  vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
  driver_id UUID REFERENCES public.drivers(id) ON DELETE SET NULL,
  speed_kmh NUMERIC(6,2) NOT NULL,
  speed_limit_kmh NUMERIC(6,2),
  location JSONB,
  is_violation BOOLEAN NOT NULL DEFAULT FALSE,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_speed_logs_school ON public.speed_logs(school_id, recorded_at DESC);
CREATE INDEX idx_speed_logs_trip ON public.speed_logs(trip_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.speed_logs TO authenticated;
GRANT ALL ON public.speed_logs TO service_role;
ALTER TABLE public.speed_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Speed logs tenant read" ON public.speed_logs FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.is_school_admin_of(auth.uid(), school_id)
    OR EXISTS (SELECT 1 FROM public.drivers d WHERE d.id = driver_id AND d.user_id = auth.uid())
  );
CREATE POLICY "Speed logs insert by driver" ON public.speed_logs FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR public.is_school_admin_of(auth.uid(), school_id)
    OR EXISTS (SELECT 1 FROM public.drivers d WHERE d.id = driver_id AND d.user_id = auth.uid())
  );

-- =====================================================
-- NOTIFICATIONS
-- =====================================================
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  type TEXT,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user ON public.notifications(user_id, created_at DESC);
CREATE INDEX idx_notifications_school ON public.notifications(school_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Notifications recipient read" ON public.notifications FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_super_admin(auth.uid())
    OR public.is_school_admin_of(auth.uid(), school_id)
  );
CREATE POLICY "Notifications recipient update" ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Notifications admin insert" ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR public.is_school_admin_of(auth.uid(), school_id)
  );

-- =====================================================
-- SUBSCRIPTIONS
-- =====================================================
CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL UNIQUE REFERENCES public.schools(id) ON DELETE CASCADE,
  plan_name TEXT NOT NULL DEFAULT 'free',
  status public.subscription_status NOT NULL DEFAULT 'trialing',
  seats INT NOT NULL DEFAULT 0,
  amount_cents INT NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_subs_updated BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE POLICY "Subs tenant read" ON public.subscriptions FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.user_belongs_to_school(auth.uid(), school_id));
CREATE POLICY "Subs super admin manage" ON public.subscriptions FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));

-- =====================================================
-- AUTO-CREATE PROFILE ON SIGNUP
-- =====================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
