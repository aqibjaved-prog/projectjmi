import { createServerFn } from "@tanstack/react-start";
import { createHash, randomInt, timingSafeEqual } from "node:crypto";

const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
const RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds
const MAX_ATTEMPTS = 5;

/**
 * Throw a user-facing error that our errorMiddleware (src/start.ts) will
 * re-throw (because it has a statusCode) so TanStack serializes the message
 * back to the caller instead of returning a 500 HTML page (blank screen).
 */
function clientError(message: string, statusCode = 400): never {
  const err = new Error(message) as Error & { statusCode: number };
  err.statusCode = statusCode;
  throw err;
}

function hashCode(phone: string, code: string): string {
  return createHash("sha256").update(`${phone}:${code}`).digest("hex");
}

function syntheticEmail(phoneE164: string): string {
  const digits = phoneE164.replace(/\D/g, "");
  return `p${digits}@parent.dev.local`;
}

function validatePhone(phone: unknown): string {
  if (typeof phone !== "string" || !/^\+\d{8,15}$/.test(phone)) {
    clientError("Invalid phone");
  }
  return phone as string;
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
        clientError(`Please wait ${wait}s before requesting another OTP`);
      }
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const expires_at = new Date(Date.now() + OTP_TTL_MS).toISOString();

    const { error } = await supabaseAdmin.from("dev_otp_codes").insert({
      phone: data.phone,
      code_hash: hashCode(data.phone, code),
      expires_at,
    });
    if (error) clientError(error.message);

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
    if (!/^\d{6}$/.test(data.code)) clientError("Invalid code");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: row, error: fetchErr } = await supabaseAdmin
      .from("dev_otp_codes")
      .select("id, code_hash, expires_at, attempts, consumed_at")
      .eq("phone", data.phone)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchErr) clientError(fetchErr.message);
    if (!row) clientError("No OTP requested for this number");
    if (row.consumed_at) clientError("This OTP has already been used");
    if (new Date(row.expires_at as string).getTime() < Date.now()) {
      clientError("OTP has expired. Please request a new one.");
    }
    if ((row.attempts as number) >= MAX_ATTEMPTS) {
      clientError("Too many attempts. Please request a new OTP.");
    }

    const expected = Buffer.from(row.code_hash as string, "hex");
    const provided = Buffer.from(hashCode(data.phone, data.code), "hex");
    const match = expected.length === provided.length && timingSafeEqual(expected, provided);

    if (!match) {
      await supabaseAdmin
        .from("dev_otp_codes")
        .update({ attempts: (row.attempts as number) + 1 })
        .eq("id", row.id as string);
      clientError("Incorrect OTP. Please try again.");
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
      clientError(created.error.message);
    }

    const linkRes = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    if (linkRes.error) clientError(linkRes.error.message);

    const token_hash = linkRes.data.properties?.hashed_token;
    if (!token_hash) clientError("Failed to mint dev session token");

    console.info(`[dev-otp] verified phone=${data.phone}`);

    return { email, token_hash };
  });
