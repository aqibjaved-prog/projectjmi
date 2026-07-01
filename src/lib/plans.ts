import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

export type Plan = Database["public"]["Tables"]["subscription_plans"]["Row"];
export type BillingCycle = Database["public"]["Enums"]["billing_cycle"];
export type PaymentStatus = Database["public"]["Enums"]["payment_status"];
export type SubscriptionStatus = Database["public"]["Enums"]["subscription_status"];

export const TIERS = ["trial", "basic", "standard", "premium"] as const;
export type Tier = (typeof TIERS)[number];

export const planSchema = z.object({
  code: z.string().trim().min(2).max(64).regex(/^[a-z0-9_]+$/i, "letters, numbers and _ only"),
  name: z.string().trim().min(2).max(120),
  tier: z.enum(TIERS),
  billing_cycle: z.enum(["trial", "monthly", "yearly"] as const),
  price_cents: z.coerce.number().int().min(0),
  currency: z.string().trim().min(3).max(8).default("USD"),
  student_limit: z.coerce.number().int().min(0).nullable().optional(),
  vehicle_limit: z.coerce.number().int().min(0).nullable().optional(),
  duration_days: z.coerce.number().int().min(0).nullable().optional(),
  is_active: z.boolean().default(true),
  features: z.record(z.string(), z.boolean()).default({}),
});
export type PlanFormValues = z.infer<typeof planSchema>;

export const FEATURE_KEYS = [
  "realtime_tracking",
  "qr_attendance",
  "parent_app",
  "reports",
  "sms",
  "api",
  "priority_support",
] as const;

export const FEATURE_LABELS: Record<(typeof FEATURE_KEYS)[number], string> = {
  realtime_tracking: "Realtime tracking",
  qr_attendance: "QR attendance",
  parent_app: "Parent app",
  reports: "Analytics & reports",
  sms: "SMS alerts",
  api: "API access",
  priority_support: "Priority support",
};

export function formatPrice(plan: Pick<Plan, "price_cents" | "currency" | "billing_cycle">) {
  if (plan.price_cents === 0) return "Free";
  const amount = (plan.price_cents / 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const suffix = plan.billing_cycle === "yearly" ? "/yr" : plan.billing_cycle === "monthly" ? "/mo" : "";
  return `${plan.currency} ${amount}${suffix}`;
}

export function formatLimit(value: number | null | undefined) {
  if (value === null || value === undefined) return "Unlimited";
  return value.toLocaleString();
}

/**
 * Compute the subscription period end from the plan's own configuration.
 * - Trial: Start + plan.duration_days (must be a positive integer; no hardcoded fallback).
 * - Monthly: Start + 1 month.
 * - Yearly: Start + 1 year.
 * If a caller wants to override duration for a non-trial cycle, pass durationDays.
 */
export function periodEndFor(start: Date, cycle: BillingCycle, durationDays?: number | null): Date {
  const end = new Date(start);
  if (cycle === "trial") {
    if (!durationDays || durationDays < 1) {
      throw new Error("Trial plan is missing a valid Trial Duration (days). Set it on the plan before assigning.");
    }
    end.setDate(end.getDate() + durationDays);
  } else if (durationDays && durationDays > 0) {
    end.setDate(end.getDate() + durationDays);
  } else if (cycle === "yearly") {
    end.setFullYear(end.getFullYear() + 1);
  } else {
    end.setMonth(end.getMonth() + 1);
  }
  return end;
}

export type ExpiryState = "active" | "expiring_soon" | "expired" | "none";

export function expiryState(endsAt: string | null | undefined, warnDays = 7): ExpiryState {
  if (!endsAt) return "none";
  const ms = new Date(endsAt).getTime() - Date.now();
  const days = ms / 86_400_000;
  if (days < 0) return "expired";
  if (days <= warnDays) return "expiring_soon";
  return "active";
}

export function monthlyAmountCents(price_cents: number, cycle: BillingCycle): number {
  if (cycle === "yearly") return Math.round(price_cents / 12);
  if (cycle === "monthly") return price_cents;
  return 0; // trial
}

export function isExpiringThisMonth(endsAt: string | null | undefined): boolean {
  if (!endsAt) return false;
  const d = new Date(endsAt);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getTime() >= Date.now();
}
