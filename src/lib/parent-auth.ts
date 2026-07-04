import { supabase } from "@/integrations/supabase/client";

/**
 * Normalize a phone to E.164-ish: keep leading + then digits only.
 * Empty string returned as-is (caller validates).
 */
export function toE164(input: string, defaultCountry = "+91"): string {
  const raw = input.trim();
  if (!raw) return "";
  if (raw.startsWith("+")) return "+" + raw.slice(1).replace(/\D/g, "");
  const digits = raw.replace(/\D/g, "");
  // If user entered 10 digits, prefix default country
  if (digits.length === 10) return `${defaultCountry}${digits}`;
  return `+${digits}`;
}

export function isValidE164(p: string): boolean {
  return /^\+\d{8,15}$/.test(p);
}

export async function sendParentOtp(phoneE164: string) {
  const { error } = await supabase.auth.signInWithOtp({
    phone: phoneE164,
    options: { channel: "sms" },
  });
  if (error) throw error;
}

export async function verifyParentOtp(phoneE164: string, token: string) {
  const { data, error } = await supabase.auth.verifyOtp({
    phone: phoneE164,
    token,
    type: "sms",
  });
  if (error) throw error;
  return data;
}

/** Calls the security-definer RPC to auto-link parent from student.parent_phone. */
export async function linkParentByPhone(): Promise<{ linked: number; schools: number }> {
  const { data, error } = await supabase.rpc("link_parent_by_phone" as never);
  if (error) throw error;
  const row = Array.isArray(data) ? (data[0] as { linked_children: number; schools: number } | undefined) : undefined;
  return { linked: row?.linked_children ?? 0, schools: row?.schools ?? 0 };
}
