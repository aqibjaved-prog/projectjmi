import { useMemo, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { UserCheck, FlaskConical, ShieldCheck, Info, RotateCcw, CheckCircle2, XCircle } from "lucide-react";

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
  verifying: { label: "Verifying", variant: "default", icon: UserCheck, tone: "text-primary" },
  verified: { label: "Verified", variant: "secondary", icon: CheckCircle2, tone: "text-success" },
  failed: { label: "Failed", variant: "destructive", icon: XCircle, tone: "text-destructive" },
};

const ALCOHOL_STATES: Record<AlcoholStatus, StatusConfig> = {
  pending: { label: "Pending", variant: "secondary", icon: FlaskConical, tone: "text-muted-foreground" },
  testing: { label: "Testing", variant: "default", icon: FlaskConical, tone: "text-primary" },
  passed: { label: "Passed", variant: "secondary", icon: CheckCircle2, tone: "text-success" },
  failed: { label: "Failed", variant: "destructive", icon: XCircle, tone: "text-destructive" },
};

const OVERALL_STATES: Record<OverallStatus, StatusConfig> = {
  pending: { label: "Pending", variant: "secondary", icon: ShieldCheck, tone: "text-muted-foreground" },
  approved: { label: "Approved", variant: "secondary", icon: CheckCircle2, tone: "text-success" },
  trip_locked: { label: "Trip Locked", variant: "default", icon: ShieldCheck, tone: "text-primary" },
};

export function PreTripSafetyCheck() {
  const [identity, setIdentity] = useState<IdentityStatus>("pending");
  const [alcohol, setAlcohol] = useState<AlcoholStatus>("pending");
  const [isSimulatingIdentity, setIsSimulatingIdentity] = useState(false);
  const [isSimulatingAlcohol, setIsSimulatingAlcohol] = useState(false);

  const overall = useMemo<OverallStatus>(() => {
    if (identity === "verified" && alcohol === "passed") return "approved";
    return "pending";
  }, [identity, alcohol]);

  const simulateIdentity = useCallback((success: boolean) => {
    setIdentity("verifying");
    setIsSimulatingIdentity(true);
    window.setTimeout(() => {
      setIsSimulatingIdentity(false);
      if (success) {
        setIdentity("verified");
        toast.success("Driver identity verified (test mode)");
      } else {
        setIdentity("failed");
        toast.error("Identity verification failed (test mode)");
      }
    }, 1500);
  }, []);

  const simulateAlcohol = useCallback((success: boolean) => {
    setAlcohol("testing");
    setIsSimulatingAlcohol(true);
    window.setTimeout(() => {
      setIsSimulatingAlcohol(false);
      if (success) {
        setAlcohol("passed");
        toast.success("Alcohol test passed (test mode)");
      } else {
        setAlcohol("failed");
        toast.error("Alcohol test failed (test mode)");
      }
    }, 1500);
  }, []);

  const reset = useCallback(() => {
    setIdentity("pending");
    setAlcohol("pending");
    toast.info("Pre-trip checks reset");
  }, []);

  const identityCfg = IDENTITY_STATES[identity];
  const alcoholCfg = ALCOHOL_STATES[alcohol];
  const overallCfg = OVERALL_STATES[overall];

  const identityIcon = identityCfg.icon;
  const alcoholIcon = alcoholCfg.icon;
  const overallIcon = overallCfg.icon;

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
            Icon={identityIcon}
            label="Driver Identity Verification"
            statusConfig={identityCfg}
            status={identity}
          />
          <CheckRow
            Icon={alcoholIcon}
            label="Alcohol Detection"
            statusConfig={alcoholCfg}
            status={alcohol}
          />
          <Separator className="my-2" />
          <CheckRow
            Icon={overallIcon}
            label="Overall Status"
            statusConfig={overallCfg}
            status={overall}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button
            size="sm"
            onClick={() => simulateIdentity(true)}
            disabled={isSimulatingIdentity || identity === "verified"}
          >
            <UserCheck className="mr-1.5 h-4 w-4" />
            {isSimulatingIdentity ? "Verifying…" : identity === "verified" ? "Verified" : "Simulate identity pass"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => simulateIdentity(false)}
            disabled={isSimulatingIdentity}
          >
            <XCircle className="mr-1.5 h-4 w-4" />
            Simulate identity fail
          </Button>
          <Button
            size="sm"
            onClick={() => simulateAlcohol(true)}
            disabled={isSimulatingAlcohol || alcohol === "passed"}
          >
            <FlaskConical className="mr-1.5 h-4 w-4" />
            {isSimulatingAlcohol ? "Testing…" : alcohol === "passed" ? "Passed" : "Simulate alcohol pass"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => simulateAlcohol(false)}
            disabled={isSimulatingAlcohol}
          >
            <XCircle className="mr-1.5 h-4 w-4" />
            Simulate alcohol fail
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={reset}
            disabled={isSimulatingIdentity || isSimulatingAlcohol}
            className="ml-auto"
          >
            <RotateCcw className="mr-1.5 h-4 w-4" />
            Reset
          </Button>
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
}: {
  Icon: typeof UserCheck;
  label: string;
  statusConfig: StatusConfig;
  status: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border/70 bg-background p-3">
      <div className="flex items-center gap-3">
        <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted ${statusConfig.tone}`}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </div>
        <div>
          <div className="text-sm font-medium">{label}</div>
          <div className="text-[11px] capitalize text-muted-foreground">{status.replace("_", " ")}</div>
        </div>
      </div>
      <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
    </div>
  );
}
