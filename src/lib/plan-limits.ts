import { supabase } from "@/integrations/supabase/client";

export interface UsageMetric {
  used: number;
  limit: number | null; // null = unlimited
}

export interface PlanUsage {
  plan_code: string | null;
  plan_name: string | null;
  students: UsageMetric;
  vehicles: UsageMetric;
  drivers: UsageMetric;
  routes: UsageMetric;
  parents: UsageMetric;
}

const EMPTY: UsageMetric = { used: 0, limit: null };

export const EMPTY_USAGE: PlanUsage = {
  plan_code: null,
  plan_name: null,
  students: EMPTY,
  vehicles: EMPTY,
  drivers: EMPTY,
  routes: EMPTY,
  parents: EMPTY,
};

export async function fetchPlanUsage(schoolId: string | null | undefined): Promise<PlanUsage> {
  if (!schoolId) return EMPTY_USAGE;
  const { data, error } = await supabase.rpc("school_plan_usage" as never, { _school_id: schoolId } as never);
  if (error || !data) return EMPTY_USAGE;
  return data as unknown as PlanUsage;
}

export function usagePercent(m: UsageMetric): number {
  if (m.limit == null || m.limit <= 0) return 0;
  return Math.min(100, Math.round((m.used / m.limit) * 100));
}

export type UsageState = "ok" | "warning" | "danger" | "unlimited";

export function usageState(m: UsageMetric): UsageState {
  if (m.limit == null) return "unlimited";
  if (m.used >= m.limit) return "danger";
  if (m.used / Math.max(m.limit, 1) >= 0.8) return "warning";
  return "ok";
}

export function formatUsage(m: UsageMetric): string {
  return `${m.used} / ${m.limit == null ? "Unlimited" : m.limit}`;
}

export function remaining(m: UsageMetric): number | null {
  if (m.limit == null) return null;
  return Math.max(m.limit - m.used, 0);
}

/* -------------------- Error mapping -------------------- */

const MESSAGES: Record<string, string> = {
  PLAN_LIMIT_STUDENTS:
    "You have reached the maximum number of students allowed by your current subscription plan. Upgrade your subscription to add more students.",
  PLAN_LIMIT_VEHICLES: "Vehicle limit reached for your current subscription.",
  PLAN_LIMIT_DRIVERS: "Driver limit reached for your current subscription.",
  PLAN_LIMIT_ROUTES: "Route limit reached for your current subscription.",
  PLAN_LIMIT_PARENTS: "Parent limit reached for your current subscription.",
  PLAN_LIMIT_TRIPS: "Trip limit reached for your current subscription.",
};

export function isPlanLimitError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return msg.includes("PLAN_LIMIT_");
}

export function planLimitMessage(err: unknown): string | null {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  const match = msg.match(/PLAN_LIMIT_[A-Z]+/);
  if (!match) return null;
  return MESSAGES[match[0]] ?? "You have reached your subscription plan limit. Please upgrade to continue.";
}

/** Frontend pre-check — returns error message if adding `count` would exceed limit. */
export function preflightCheck(m: UsageMetric, addCount = 1): string | null {
  if (m.limit == null) return null;
  if (m.used + addCount > m.limit) {
    return `Plan limit reached (${m.used}/${m.limit}). Upgrade your subscription to add more.`;
  }
  return null;
}
