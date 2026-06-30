
-- Extend subscription status enum
ALTER TYPE public.subscription_status ADD VALUE IF NOT EXISTS 'expired';
ALTER TYPE public.subscription_status ADD VALUE IF NOT EXISTS 'suspended';

-- Payment status enum
DO $$ BEGIN
  CREATE TYPE public.payment_status AS ENUM ('paid','pending','overdue');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Billing cycle enum
DO $$ BEGIN
  CREATE TYPE public.billing_cycle AS ENUM ('trial','monthly','yearly');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Subscription plans catalog
CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  tier text NOT NULL,
  billing_cycle public.billing_cycle NOT NULL DEFAULT 'monthly',
  price_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  student_limit integer,
  vehicle_limit integer,
  duration_days integer,
  features jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.subscription_plans TO authenticated;
GRANT ALL ON public.subscription_plans TO service_role;

ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Plans readable by authenticated" ON public.subscription_plans
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Plans managed by super admin" ON public.subscription_plans
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE TRIGGER trg_subscription_plans_updated_at
  BEFORE UPDATE ON public.subscription_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Augment subscriptions table
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS plan_id uuid REFERENCES public.subscription_plans(id),
  ADD COLUMN IF NOT EXISTS billing_cycle public.billing_cycle NOT NULL DEFAULT 'trial',
  ADD COLUMN IF NOT EXISTS payment_status public.payment_status NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS renewal_date timestamptz;

-- Subscription history
CREATE TABLE IF NOT EXISTS public.subscription_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  from_plan text,
  to_plan text,
  from_cycle public.billing_cycle,
  to_cycle public.billing_cycle,
  action text NOT NULL,
  amount_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  period_start timestamptz,
  period_end timestamptz,
  notes text,
  performed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS subscription_history_school_idx
  ON public.subscription_history(school_id, created_at DESC);

GRANT SELECT, INSERT ON public.subscription_history TO authenticated;
GRANT ALL ON public.subscription_history TO service_role;

ALTER TABLE public.subscription_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "History super admin all" ON public.subscription_history
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "History school read" ON public.subscription_history
  FOR SELECT TO authenticated
  USING (public.user_belongs_to_school(auth.uid(), school_id));

-- Seed default plans
INSERT INTO public.subscription_plans (code, name, tier, billing_cycle, price_cents, student_limit, vehicle_limit, duration_days, features, sort_order)
VALUES
  ('trial', 'Trial', 'trial', 'trial', 0, 50, 5, 30,
   '{"realtime_tracking":true,"qr_attendance":true,"parent_app":true,"reports":false,"sms":false,"api":false}'::jsonb, 0),
  ('basic_monthly', 'Basic (Monthly)', 'basic', 'monthly', 4900, 200, 10, NULL,
   '{"realtime_tracking":true,"qr_attendance":true,"parent_app":true,"reports":true,"sms":false,"api":false}'::jsonb, 10),
  ('basic_yearly', 'Basic (Yearly)', 'basic', 'yearly', 49000, 200, 10, NULL,
   '{"realtime_tracking":true,"qr_attendance":true,"parent_app":true,"reports":true,"sms":false,"api":false}'::jsonb, 11),
  ('standard_monthly', 'Standard (Monthly)', 'standard', 'monthly', 9900, 600, 30, NULL,
   '{"realtime_tracking":true,"qr_attendance":true,"parent_app":true,"reports":true,"sms":true,"api":false}'::jsonb, 20),
  ('standard_yearly', 'Standard (Yearly)', 'standard', 'yearly', 99000, 600, 30, NULL,
   '{"realtime_tracking":true,"qr_attendance":true,"parent_app":true,"reports":true,"sms":true,"api":false}'::jsonb, 21),
  ('premium_monthly', 'Premium (Monthly)', 'premium', 'monthly', 19900, NULL, NULL, NULL,
   '{"realtime_tracking":true,"qr_attendance":true,"parent_app":true,"reports":true,"sms":true,"api":true,"priority_support":true}'::jsonb, 30),
  ('premium_yearly', 'Premium (Yearly)', 'premium', 'yearly', 199000, NULL, NULL, NULL,
   '{"realtime_tracking":true,"qr_attendance":true,"parent_app":true,"reports":true,"sms":true,"api":true,"priority_support":true}'::jsonb, 31)
ON CONFLICT (code) DO NOTHING;
