import { supabase } from "@/integrations/supabase/client";
import { z } from "zod";

export const SUBSCRIPTION_PLANS = [
  { id: "trial", name: "Trial", amountCents: 0, seats: 50 },
  { id: "starter", name: "Starter", amountCents: 4900, seats: 200 },
  { id: "growth", name: "Growth", amountCents: 14900, seats: 1000 },
  { id: "enterprise", name: "Enterprise", amountCents: 49900, seats: 10000 },
] as const;

export type PlanId = (typeof SUBSCRIPTION_PLANS)[number]["id"];

export function planFor(id: string | null | undefined) {
  return SUBSCRIPTION_PLANS.find((p) => p.id === id) ?? SUBSCRIPTION_PLANS[0];
}

export const schoolSchema = z.object({
  name: z.string().trim().min(2, "Name is required").max(120),
  contact_person: z.string().trim().max(120).optional().or(z.literal("")),
  email: z.string().trim().email("Invalid email").max(255).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  address: z.string().trim().max(500).optional().or(z.literal("")),
  city: z.string().trim().max(120).optional().or(z.literal("")),
  country: z.string().trim().max(120).optional().or(z.literal("")),
});

export type SchoolFormValues = z.infer<typeof schoolSchema>;

export const subscriptionSchema = z.object({
  plan_id: z.enum(["trial", "starter", "growth", "enterprise"]),
  starts_on: z.string().min(1, "Start date is required"),
  ends_on: z.string().min(1, "End date is required"),
});

export type SubscriptionFormValues = z.infer<typeof subscriptionSchema>;

export function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || crypto.randomUUID().slice(0, 8);
}

export async function uploadSchoolLogo(schoolId: string, file: File): Promise<string> {
  const ext = file.name.split(".").pop() ?? "png";
  const path = `${schoolId}/logo-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("school-logos").upload(path, file, {
    cacheControl: "3600",
    upsert: true,
    contentType: file.type,
  });
  if (error) throw error;
  const { data } = supabase.storage.from("school-logos").createSignedUrl
    ? await supabase.storage.from("school-logos").createSignedUrl(path, 60 * 60 * 24 * 365)
    : { data: null };
  // bucket is private — return signed URL; fallback to storage path
  return data?.signedUrl ?? path;
}

export type SubscriptionExpiry = "active" | "expiring_soon" | "expired" | "none";

export function subscriptionExpiry(endsAt: string | null | undefined): SubscriptionExpiry {
  if (!endsAt) return "none";
  const end = new Date(endsAt).getTime();
  const now = Date.now();
  const days = (end - now) / (1000 * 60 * 60 * 24);
  if (days < 0) return "expired";
  if (days <= 14) return "expiring_soon";
  return "active";
}
