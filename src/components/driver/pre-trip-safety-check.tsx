import { useMemo, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { UserCheck, FlaskConical, ShieldCheck, Info, RotateCcw, CheckCircle2, XCircle, Loader2 } from "lucide-react";

type IdentityStatus = "pending" | "verifying" | "verified" | "failed";
type AlcoholStatus = "pending" | "testing" | "passed" | "failed";
type OverallStatus = "pending" | "approved" | "trip_locked";

interface StatusConfig {
  label: string;
  variant: "default" | "secondary" | "outline" | "destructive";
  icon: typeof UserCheck;
  tone: string;
}

const IDENTITY_STATES: Record<IdentityStatus, StatusConfig> = {
  pending: { label: "Pending", variant: "secondary", icon: UserCheck, tone: "text-muted-foreground" },
  verifying: { label: "Verifying…", variant: "default", icon: Loader2, tone: "text-primary" },
  verified: { label: "Verified", variant: "secondary", icon: CheckCircle2, tone: "text-success" },
  failed: { label: "Failed", variant: "destructive", icon: XCircle, tone: "text-destructive" },
};

const ALCOHOL_STATES: Record<AlcoholStatus, StatusConfig> = {
  pending: { label: "Pending", variant: "secondary", icon: FlaskConical, tone: "text-muted-foreground" },
  testing: { label: "Testing…", variant: "default", icon: Loader2, tone: "text-primary" },
  passed: { label: "Passed", variant: "secondary", icon: CheckCircle2, tone: "text-success" },
  failed: { label: "Failed", variant: "destructive", icon: XCircle, tone: "text-destructive" },
};

const OVERALL_STATES: Record<OverallStatus, StatusConfig> = {
  pending: { label: "Pending", variant: "secondary", icon: ShieldCheck, tone: "text-muted-foreground" },
  approved: { label: "Approved", variant: "secondary", icon: CheckCircle2, tone: "text-success" },
  trip_locked: { label: "Trip Locked", variant: "default", icon: ShieldCheck, tone: "text-primary" },
};

const SIMULATION_DELAY_MS = 1200;

export function PreTripSafetyCheck() {
  const [identity, setIdentity] = useState<IdentityStatus>("pending");
  const [alcohol, setAlcohol] = useState<AlcoholStatus>("pending");
  const [identityOutcomeVisible, setIdentityOutcomeVisible] = useState(false);
  const [alcoholOutcomeVisible, setAlcoholOutcomeVisible] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  const overall = useMemo<OverallStatus>(() => {
    if (identity === "verified" && alcohol === "passed") return "approved";
    return "pending";
  }, [identity, alcohol]);

  const startIdentitySimulation = useCallback(() => {
    setIdentity("verifying");
    setIsVerifying(true);
    setIdentityOutcomeVisible(false);
    window.setTimeout(() => {
      setIsVerifying(false);
      setIdentityOutcomeVisible(true);
    }, SIMULATION_DELAY_MS);
  }, []);

  const chooseIdentity = useCallback((success: boolean) => {
    if (success) {
      setIdentity("verified");
      toast.success("Driver identity verified (test mode)");
    } else {
      setIdentity("failed");
      toast.error("Identity verification failed (test mode)");
    }
    setIdentityOutcomeVisible(false);
  }, []);

  const startAlcoholSimulation = useCallback(() => {
    setAlcohol("testing");
    setIsTesting(true);
    setAlcoholOutcomeVisible(false);
    window.setTimeout(() => {
      setIsTesting(false);
      setAlcoholOutcomeVisible(true);
    }, SIMULATION_DELAY_MS);
  }, []);

  const chooseAlcohol = useCallback((success: boolean) => {
    if (success) {
      setAlcohol("passed");
      toast.success("Alcohol test passed (test mode)");
    } else {
      setAlcohol("failed");
      toast.error("Alcohol test failed (test mode)");
    }
    setAlcoholOutcomeVisible(false);
  }, []);

  const reset = useCallback(() => {
    setIdentity("pending");
    setAlcohol("pending");
    setIdentityOutcomeVisible(false);
    setAlcoholOutcomeVisible(false);
    setIsVerifying(false);
    setIsTesting(false);
    toast.info("Pre-trip checks reset");
  }, []);

  const identityCfg = IDENTITY_STATES[identity];
  const alcoholCfg = ALCOHOL_STATES[alcohol];
  const overallCfg = OVERALL_STATES[overall];

  return (
    <Card className="border-dashed border-warning/40 bg-warning/[0.02]">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-warning/10 text-warning">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold">Pre-Trip Safety Verification</CardTitle>
              <p className="mt-0.5 max-w-md text-xs text-muted-foreground">
                Complete both checks before starting the trip. This is a test-mode UI only.
              </p>
            </div>
          </div>
          <Badge variant="outline" className="w-fit border-warning/40 text-warning">
            TEST MODE
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-0">
        <div className="flex items-start gap-3 rounded-lg border border-warning/20 bg-warning/5 p-3 text-xs text-warning-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Hardware sensors not connected. Use the buttons below to simulate verification states.</span>
        </div>

        <div className="space-y-2">
          <CheckRow
            Icon={identityCfg.icon}
            label="Driver Identity Verification"
            statusConfig={identityCfg}
            status={identity}
            spinIcon={identity === "verifying"}
          >
            {identity === "pending" && (
              <Button size="sm" onClick={startIdentitySimulation}>
                <UserCheck className="mr-1.5 h-4 w-4" />
                Simulate Identity Verification
              </Button>
            )}
            {identityOutcomeVisible && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => chooseIdentity(true)}>
                  <CheckCircle2 className="mr-1.5 h-4 w-4" />
                  Identity Verified
                </Button>
                <Button size="sm" variant="destructive" onClick={() => chooseIdentity(false)}>
                  <XCircle className="mr-1.5 h-4 w-4" />
                  Identity Failed
                </Button>
              </div>
            )}
          </CheckRow>

          <CheckRow
            Icon={alcoholCfg.icon}
            label="Alcohol Detection"
            statusConfig={alcoholCfg}
            status={alcohol}
            spinIcon={alcohol === "testing"}
          >
            {alcohol === "pending" && (
              <Button size="sm" onClick={startAlcoholSimulation}>
                <FlaskConical className="mr-1.5 h-4 w-4" />
                Simulate Alcohol Test
              </Button>
            )}
            {alcoholOutcomeVisible && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => chooseAlcohol(true)}>
                  <CheckCircle2 className="mr-1.5 h-4 w-4" />
                  Alcohol Test Passed
                </Button>
                <Button size="sm" variant="destructive" onClick={() => chooseAlcohol(false)}>
                  <XCircle className="mr-1.5 h-4 w-4" />
                  Alcohol Test Failed
                </Button>
              </div>
            )}
          </CheckRow>

          <Separator className="my-2" />

          <CheckRow
            Icon={overallCfg.icon}
            label="Overall Status"
            statusConfig={overallCfg}
            status={overall}
          >
            <Button size="sm" variant="ghost" onClick={reset} disabled={isVerifying || isTesting}>
              <RotateCcw className="mr-1.5 h-4 w-4" />
              Reset
            </Button>
          </CheckRow>
        </div>
      </CardContent>
    </Card>
  );
}

function CheckRow({
  Icon,
  label,
  statusConfig,
  status,
  spinIcon,
  children,
}: {
  Icon: typeof UserCheck;
  label: string;
  statusConfig: StatusConfig;
  status: string;
  spinIcon?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-md border border-border/70 bg-background p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted ${statusConfig.tone}`}>
          <Icon className={`h-4 w-4 ${spinIcon ? "animate-spin" : ""}`} aria-hidden="true" />
        </div>
        <div>
          <div className="text-sm font-medium">{label}</div>
          <div className="text-[11px] capitalize text-muted-foreground">{status.replace("_", " ")}</div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
        {children}
      </div>
    </div>
  );
}
