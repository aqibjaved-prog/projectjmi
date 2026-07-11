import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Bus, Loader2, Phone, AlertTriangle, Copy } from "lucide-react";
import { toast } from "sonner";
import { ROLE_HOME } from "@/lib/role-access";
import { DEVELOPMENT_OTP_MODE, isValidE164, sendParentOtp, toE164, verifyParentOtp, linkParentByPhone } from "@/lib/parent-auth";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in — School Van Guardian" }] }),
  component: AuthPage,
});

function AuthPage() {
  const { user, loading, primaryRole, refreshRoles } = useAuth();
  const navigate = useNavigate();

  // Staff (email/password)
  const [mode, setMode] = useState<"signin" | "reset">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  // Parent (phone OTP)
  const [phoneInput, setPhoneInput] = useState("");
  const [phoneE164, setPhoneE164] = useState("");
  const [otpStage, setOtpStage] = useState<"phone" | "code">("phone");
  const [otpCode, setOtpCode] = useState("");
  const [parentBusy, setParentBusy] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  useEffect(() => {
    if (loading || !user) return;
    if (linkError) return; // stay on page to show message
    const target = primaryRole ? ROLE_HOME[primaryRole] : "/dashboard";
    navigate({ to: target });
  }, [user, loading, primaryRole, navigate, linkError]);

  const submitStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welcome back!");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        toast.success("Password reset email sent.");
        setMode("signin");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  };

  const sendOtp = async () => {
    const e164 = toE164(phoneInput);
    if (!isValidE164(e164)) {
      toast.error("Enter a valid mobile number (e.g. +15551234567)");
      return;
    }
    setParentBusy(true);
    try {
      const res = await sendParentOtp(e164);
      setPhoneE164(e164);
      setOtpStage("code");
      setCooldown(60);
      if (res.devOtp) {
        setDevOtp(res.devOtp);
        toast.success(`Development OTP generated for ${e164}`);
      } else {
        setDevOtp(null);
        toast.success(`OTP sent to ${e164}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to send OTP";
      toast.error(msg);
    } finally {
      setParentBusy(false);
    }
  };

  const verifyOtp = async () => {
    if (otpCode.length !== 6) return;
    setParentBusy(true);
    setLinkError(null);
    try {
      await verifyParentOtp(phoneE164, otpCode);
      const res = await linkParentByPhone();
      if (res.linked === 0) {
        setLinkError("No student is linked to this mobile number. Please contact your school.");
        toast.error("No students found for this mobile number");
        await supabase.auth.signOut();
        setOtpStage("phone");
        setOtpCode("");
      } else {
        await refreshRoles();
        toast.success(`Signed in — ${res.linked} child${res.linked > 1 ? "ren" : ""} linked`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Invalid OTP";
      toast.error(msg);
    } finally {
      setParentBusy(false);
    }
  };

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden overflow-hidden bg-[image:var(--gradient-brand)] p-12 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
        {/* Ambient glow accents */}
        <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-primary/40 blur-3xl" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-32 -right-16 h-96 w-96 rounded-full bg-primary/25 blur-3xl" aria-hidden="true" />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          aria-hidden="true"
          style={{
            backgroundImage:
              "linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />

        <Link to="/" className="relative flex items-center gap-2.5">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-white/10 ring-1 ring-white/20 backdrop-blur">
            <Bus className="h-5 w-5" />
          </div>
          <span className="font-display text-[15px] font-semibold tracking-tight">School Van Guardian</span>
        </Link>

        <div className="relative max-w-md">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-white/80 backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" /> Real-time transport safety
          </div>
          <h2 className="font-display text-4xl font-semibold leading-[1.1] tracking-tight text-balance">
            Safer rides.<br />Calmer parents.
          </h2>
          <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-white/70 text-pretty">
            Staff sign in with email. Parents sign in instantly with their mobile number — no accounts to create.
          </p>
        </div>

        <p className="relative text-xs text-white/60">
          © {new Date().getFullYear()} School Van Guardian
        </p>
      </div>

      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-[image:var(--gradient-ember)] text-primary-foreground shadow-[var(--shadow-glow)]">
              <Bus className="h-5 w-5" />
            </div>
            <span className="font-display text-[15px] font-semibold tracking-tight">School Van Guardian</span>
          </div>

          <Tabs defaultValue="parent" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="parent">
                <Phone className="mr-2 h-4 w-4" /> Parent
              </TabsTrigger>
              <TabsTrigger value="staff">Staff sign in</TabsTrigger>
            </TabsList>

            {/* --- Parent OTP --- */}
            <TabsContent value="parent" className="mt-6 space-y-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h1 className="text-2xl font-semibold tracking-tight">Parent sign in</h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Use the mobile number registered with your school.
                  </p>
                </div>
                {DEVELOPMENT_OTP_MODE && (
                  <Badge variant="destructive" className="whitespace-nowrap">DEV MODE</Badge>
                )}
              </div>

              {DEVELOPMENT_OTP_MODE && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Development Mode</AlertTitle>
                  <AlertDescription>
                    OTP is displayed on screen. No SMS is sent. Disable by setting
                    <code className="mx-1 rounded bg-background/60 px-1 py-0.5 text-xs">VITE_DEVELOPMENT_OTP_MODE=false</code>
                    and configuring an SMS provider in backend Auth settings.
                  </AlertDescription>
                </Alert>
              )}

              {linkError && (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                  {linkError}
                </div>
              )}

              {otpStage === "phone" ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="phone">Mobile number</Label>
                    <Input
                      id="phone"
                      type="tel"
                      inputMode="tel"
                      placeholder="+91 98765 43210"
                      value={phoneInput}
                      onChange={(e) => setPhoneInput(e.target.value)}
                      autoComplete="tel"
                    />
                    <p className="text-xs text-muted-foreground">
                      Include country code. Example: +1 555 123 4567
                    </p>
                  </div>
                  <Button className="w-full" onClick={sendOtp} disabled={parentBusy}>
                    {parentBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Send OTP
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {devOtp && (
                    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
                      <p className="text-xs font-medium uppercase tracking-wide text-amber-700 dark:text-amber-400">
                        Development OTP — displayed on screen only
                      </p>
                      <div className="mt-2 flex items-center justify-between gap-3">
                        <span className="font-mono text-3xl font-bold tracking-[0.4em] text-amber-900 dark:text-amber-200">
                          {devOtp}
                        </span>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              navigator.clipboard.writeText(devOtp).catch(() => {});
                              toast.success("OTP copied");
                            }}
                          >
                            <Copy className="mr-1 h-3 w-3" /> Copy
                          </Button>
                          <Button size="sm" onClick={() => setOtpCode(devOtp)}>
                            Autofill
                          </Button>
                        </div>
                      </div>
                      <p className="mt-2 text-[11px] text-amber-700/80 dark:text-amber-400/80">
                        Expires in 5 minutes. No SMS was sent.
                      </p>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label>Enter the 6-digit code sent to {phoneE164}</Label>
                    <InputOTP maxLength={6} value={otpCode} onChange={setOtpCode}>
                      <InputOTPGroup>
                        {[0, 1, 2, 3, 4, 5].map((i) => (
                          <InputOTPSlot key={i} index={i} />
                        ))}
                      </InputOTPGroup>
                    </InputOTP>
                  </div>
                  <Button className="w-full" onClick={verifyOtp} disabled={parentBusy || otpCode.length !== 6}>
                    {parentBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Verify &amp; sign in
                  </Button>
                  <div className="flex justify-between text-xs">
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => { setOtpStage("phone"); setOtpCode(""); setDevOtp(null); }}
                    >
                      Change number
                    </button>
                    <button
                      type="button"
                      className="text-primary hover:underline disabled:opacity-50 disabled:no-underline"
                      onClick={sendOtp}
                      disabled={parentBusy || cooldown > 0}
                    >
                      {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend OTP"}
                    </button>
                  </div>
                </div>
              )}
            </TabsContent>

            {/* --- Staff email/password --- */}
            <TabsContent value="staff" className="mt-6">
              <h1 className="text-2xl font-semibold tracking-tight">
                {mode === "reset" ? "Reset password" : "Staff sign in"}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {mode === "reset" ? "We'll email you a reset link." : "For Super Admin, School Admin and Drivers."}
              </p>

              <form onSubmit={submitStaff} className="mt-6 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
                </div>
                {mode !== "reset" && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password">Password</Label>
                      <button type="button" onClick={() => setMode("reset")} className="text-xs text-primary hover:underline">
                        Forgot password?
                      </button>
                    </div>
                    <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} autoComplete="current-password" />
                  </div>
                )}
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {mode === "signin" ? "Sign in" : "Send reset link"}
                </Button>
                {mode === "reset" && (
                  <button type="button" onClick={() => setMode("signin")} className="block w-full text-center text-sm text-muted-foreground hover:text-foreground">
                    Back to sign in
                  </button>
                )}
              </form>

              <p className="mt-8 text-center text-xs text-muted-foreground">
                Staff accounts are provisioned by administrators.
              </p>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
