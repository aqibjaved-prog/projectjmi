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
      await sendParentOtp(e164);
      setPhoneE164(e164);
      setOtpStage("code");
      toast.success(`OTP sent to ${e164}`);
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
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden bg-[image:var(--gradient-brand)] p-12 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
        <Link to="/" className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-white/15 backdrop-blur">
            <Bus className="h-5 w-5" />
          </div>
          <span className="font-semibold">School Van Guardian</span>
        </Link>
        <div className="max-w-md">
          <h2 className="text-3xl font-semibold tracking-tight">Safer rides, calmer parents.</h2>
          <p className="mt-3 text-sm text-white/80">
            Staff sign in with email. Parents sign in instantly with their mobile number — no accounts to create.
          </p>
        </div>
        <p className="text-xs text-white/70">© {new Date().getFullYear()} School Van Guardian</p>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="mb-6 flex items-center gap-2 lg:hidden">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Bus className="h-5 w-5" />
            </div>
            <span className="font-semibold">School Van Guardian</span>
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
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">Parent sign in</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Use the mobile number registered with your school.
                </p>
              </div>

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
                      onClick={() => { setOtpStage("phone"); setOtpCode(""); }}
                    >
                      Change number
                    </button>
                    <button
                      type="button"
                      className="text-primary hover:underline"
                      onClick={sendOtp}
                      disabled={parentBusy}
                    >
                      Resend OTP
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
