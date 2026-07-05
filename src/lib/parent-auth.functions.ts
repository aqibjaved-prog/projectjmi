import { createServerFn } from "@tanstack/react-start";
import { createHash, randomInt, timingSafeEqual } from "node:crypto";

const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
const RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds
const MAX_ATTEMPTS = 5;

function hashCode(phone: string, code: string): string {
  return createHash("sha256").update(`${phone}:${code}`).digest("hex");
}

function syntheticEmail(phoneE164: string): string {
  const digits = phoneE164.replace(/\D/g, "");
  return `p${digits}@parent.dev.local`;
}

function validatePhone(phone: unknown): string {
  if (typeof phone !== "string" || !/^\+\d{8,15}$/.test(phone)) {
    throw new Error("Invalid phone");
  }
  return phone;
}

/**
 * Development-only: generates a 6-digit OTP server-side, stores its hash,
 * and returns the plain code so the UI can display it. No SMS is sent.
 * Enforces 60s resend cooldown.
 */
export const sendDevOtp = createServerFn({ method: "POST" })
  .inputValidator((input: { phone: string }) => ({ phone: validatePhone(input.phone) }))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Cooldown check — most recent code for this phone
    const { data: recent } = await supabaseAdmin
      .from("dev_otp_codes")
      .select("created_at")
      .eq("phone", data.phone)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recent) {
      const elapsed = Date.now() - new Date(recent.created_at as string).getTime();
      if (elapsed < RESEND_COOLDOWN_MS) {
        const wait = Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000);
        throw new Error(`Please wait ${wait}s before requesting another OTP`);
      }
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const expires_at = new Date(Date.now() + OTP_TTL_MS).toISOString();

    const { error } = await supabaseAdmin.from("dev_otp_codes").insert({
      phone: data.phone,
      code_hash: hashCode(data.phone, code),
      expires_at,
    });
    if (error) throw new Error(error.message);

    // Audit log (non-PII code)
    console.info(`[dev-otp] issued phone=${data.phone} expires=${expires_at}`);

    return { otp: code, expiresAt: expires_at, ttlSeconds: OTP_TTL_MS / 1000 };
  });

/**
 * Development-only: verifies the OTP, then ensures a Supabase auth user exists
 * for this phone (with a synthetic email so we can mint a magic-link token),
 * and returns { email, token_hash } for the client to call
 * supabase.auth.verifyOtp({ type: 'magiclink', token_hash }).
 * The client-side session flow is identical to production Supabase Phone Auth.
 */
export const verifyDevOtp = createServerFn({ method: "POST" })
  .inputValidator((input: { phone: string; code: string }) => ({
    phone: validatePhone(input.phone),
    code: String(input.code ?? "").trim(),
  }))
  .handler(async ({ data }) => {
    if (!/^\d{6}$/.test(data.code)) throw new Error("Invalid code");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: row, error: fetchErr } = await supabaseAdmin
      .from("dev_otp_codes")
      .select("id, code_hash, expires_at, attempts, consumed_at")
      .eq("phone", data.phone)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchErr) throw new Error(fetchErr.message);
    if (!row) throw new Error("No OTP requested for this number");
    if (row.consumed_at) throw new Error("This OTP has already been used");
    if (new Date(row.expires_at as string).getTime() < Date.now()) {
      throw new Error("OTP has expired. Please request a new one.");
    }
    if ((row.attempts as number) >= MAX_ATTEMPTS) {
      throw new Error("Too many attempts. Please request a new OTP.");
    }

    const expected = Buffer.from(row.code_hash as string, "hex");
    const provided = Buffer.from(hashCode(data.phone, data.code), "hex");
    const match = expected.length === provided.length && timingSafeEqual(expected, provided);

    if (!match) {
      await supabaseAdmin
        .from("dev_otp_codes")
        .update({ attempts: (row.attempts as number) + 1 })
        .eq("id", row.id as string);
      throw new Error("Incorrect OTP. Please try again.");
    }

    await supabaseAdmin
      .from("dev_otp_codes")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", row.id as string);

    // Ensure an auth user exists for this phone (with a synthetic email so
    // we can mint a magic-link that the browser client uses to establish a session).
    const email = syntheticEmail(data.phone);

    // Try to create; ignore "already exists" so re-logins work.
    const created = await supabaseAdmin.auth.admin.createUser({
      email,
      phone: data.phone,
      email_confirm: true,
      phone_confirm: true,
      user_metadata: { dev_parent_login: true },
    });
    if (created.error && !/already|exists|registered/i.test(created.error.message)) {
      throw new Error(created.error.message);
    }

    const linkRes = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    if (linkRes.error) throw new Error(linkRes.error.message);

    const token_hash = linkRes.data.properties?.hashed_token;
    if (!token_hash) throw new Error("Failed to mint dev session token");

    console.info(`[dev-otp] verified phone=${data.phone}`);

    return { email, token_hash };
  });
