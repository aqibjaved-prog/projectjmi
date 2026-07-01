import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Infinity as InfinityIcon } from "lucide-react";
import { formatUsage, usagePercent, usageState, type PlanUsage, type UsageMetric } from "@/lib/plan-limits";

function Row({ label, metric }: { label: string; metric: UsageMetric }) {
  const state = usageState(metric);
  const pct = usagePercent(metric);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <span className="font-medium">{label}</span>
          {state === "unlimited" && (
            <Badge variant="secondary" className="gap-1"><InfinityIcon className="h-3 w-3" /> Unlimited</Badge>
          )}
          {state === "warning" && (
            <Badge variant="secondary" className="gap-1 text-amber-600"><AlertTriangle className="h-3 w-3" /> Near limit</Badge>
          )}
          {state === "danger" && (
            <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" /> Limit reached</Badge>
          )}
        </div>
        <span className="tabular-nums text-muted-foreground">{formatUsage(metric)}</span>
      </div>
      {state !== "unlimited" && (
        <Progress
          value={pct}
          className={state === "danger" ? "[&>div]:bg-destructive" : state === "warning" ? "[&>div]:bg-amber-500" : ""}
        />
      )}
    </div>
  );
}

export function PlanUsageCard({ usage, title = "Subscription usage" }: { usage: PlanUsage; title?: string }) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">{title}</CardTitle>
        {usage.plan_name && <Badge variant="outline">{usage.plan_name}</Badge>}
      </CardHeader>
      <CardContent className="space-y-4">
        <Row label="Students" metric={usage.students} />
        <Row label="Vehicles" metric={usage.vehicles} />
        <Row label="Drivers" metric={usage.drivers} />
        <Row label="Routes" metric={usage.routes} />
        <Row label="Parents" metric={usage.parents} />
      </CardContent>
    </Card>
  );
}
