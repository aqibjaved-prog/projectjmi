import { supabase } from "@/integrations/supabase/client";
import { sendDevOtp, verifyDevOtp } from "@/lib/parent-auth.functions";

/**
 * Development Mode flag. When true, OTPs are generated server-side and shown
 * on screen — no SMS is sent. When false, the app uses Supabase Phone Auth
 * with whatever real SMS provider is configured in the backend (Twilio,
 * MessageBird, Vonage, etc.). Switching to production requires only setting
 * VITE_DEVELOPMENT_OTP_MODE=false and configuring the SMS provider in
 * Supabase Auth — no application code changes.
 */
export const DEVELOPMENT_OTP_MODE =
  String(import.meta.env.VITE_DEVELOPMENT_OTP_MODE ?? "true").toLowerCase() !== "false";

/**
 * Normalize a phone to E.164-ish: keep leading + then digits only.
 */
export function toE164(input: string, defaultCountry = "+91"): string {
  const raw = input.trim();
  if (!raw) return "";
  if (raw.startsWith("+")) return "+" + raw.slice(1).replace(/\D/g, "");
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `${defaultCountry}${digits}`;
  return `+${digits}`;
}

export function isValidE164(p: string): boolean {
  return /^\+\d{8,15}$/.test(p);
}

export interface SendOtpResult {
  /** In development mode, the generated OTP to display on-screen. Undefined in production. */
  devOtp?: string;
  ttlSeconds?: number;
}

export async function sendParentOtp(phoneE164: string): Promise<SendOtpResult> {
  if (DEVELOPMENT_OTP_MODE) {
    const res = await sendDevOtp({ data: { phone: phoneE164 } });
    return { devOtp: res.otp, ttlSeconds: res.ttlSeconds };
  }
  const { error } = await supabase.auth.signInWithOtp({
    phone: phoneE164,
    options: { channel: "sms" },
  });
  if (error) throw error;
  return {};
}

export async function verifyParentOtp(phoneE164: string, token: string) {
  if (DEVELOPMENT_OTP_MODE) {
    const { email, token_hash } = await verifyDevOtp({
      data: { phone: phoneE164, code: token },
    });
    // Uses the exact same client verifyOtp API as production Phone Auth.
    const { data, error } = await supabase.auth.verifyOtp({
      type: "magiclink",
      token_hash,
      email,
    } as never);
    if (error) throw error;
    return data;
  }
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
  const row = Array.isArray(data)
    ? (data[0] as { linked_children: number; schools: number } | undefined)
    : undefined;
  return { linked: row?.linked_children ?? 0, schools: row?.schools ?? 0 };
}
