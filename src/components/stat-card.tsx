import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface Props {
  label: string;
  value: number | string | null | undefined;
  icon: LucideIcon;
  hint?: string;
  loading?: boolean;
  tone?: "default" | "success" | "warning" | "destructive";
}

const TONE: Record<NonNullable<Props["tone"]>, string> = {
  default: "bg-primary/10 text-primary ring-primary/20",
  success: "bg-success/15 text-success ring-success/25",
  warning: "bg-warning/20 text-warning-foreground ring-warning/30",
  destructive: "bg-destructive/10 text-destructive ring-destructive/25",
};

export function StatCard({ label, value, icon: Icon, hint, loading, tone = "default" }: Props) {
  return (
    <Card className="group relative overflow-hidden border-border/70 bg-card transition-all duration-200 hover:-translate-y-0.5 hover:border-border hover:shadow-elevated">
      <CardContent className="flex items-center gap-4 p-5">
        <div
          className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ring-1 ${TONE[tone]}`}
        >
          <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {label}
          </div>
          {loading ? (
            <Skeleton className="mt-1.5 h-7 w-20" />
          ) : (
            <div className="mt-0.5 font-display text-[26px] font-semibold leading-tight tabular-nums text-foreground">
              {value ?? "—"}
            </div>
          )}
          {hint && <div className="mt-1 truncate text-xs text-muted-foreground">{hint}</div>}
        </div>
      </CardContent>
    </Card>
  );
}
