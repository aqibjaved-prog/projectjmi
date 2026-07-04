import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Baby, Bus, Bell, MapPin, Radio, School as SchoolIcon } from "lucide-react";
import { useParentChildren, useTodayTripsForChildren } from "@/hooks/use-parent-children";

export const Route = createFileRoute("/_authenticated/parent/dashboard")({
  head: () => ({ meta: [{ title: "Parent dashboard" }] }),
  component: ParentDashboard,
});

function ParentDashboard() {
  const { user } = useAuth();
  const { data: children, isLoading } = useParentChildren();
  const routeIds = useMemo(() => (children ?? []).map((c) => c.route_id), [children]);
  const { data: todayTrips } = useTodayTripsForChildren(routeIds);

  const { data: unread } = useQuery({
    enabled: !!user,
    queryKey: ["parent-unread", user?.id],
    queryFn: async () => {
      const { count } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user!.id)
        .eq("is_read", false);
      return count ?? 0;
    },
  });

  const schoolNames = Array.from(new Set((children ?? []).map((c) => c.schools?.name).filter(Boolean))) as string[];
  const parentName =
    (user?.user_metadata as { full_name?: string } | undefined)?.full_name ??
    children?.[0]?.parent_phone ??
    "Parent";

  const inProgress = (todayTrips ?? []).filter((t) => (t as { status: string }).status === "in_progress").length;
  const scheduled = (todayTrips ?? []).filter((t) => (t as { status: string }).status === "scheduled").length;
  const completed = (todayTrips ?? []).filter((t) => (t as { status: string }).status === "completed").length;

  return (
    <>
      <PageHeader title={`Hi, ${parentName}`} description={schoolNames.join(" · ") || "Welcome to your parent portal."} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MiniStat icon={Baby} label="Children" value={children?.length ?? 0} loading={isLoading} />
        <MiniStat icon={Radio} label="Live now" value={inProgress} tone="success" />
        <MiniStat icon={Bus} label="Today's trips" value={(todayTrips ?? []).length} sub={`${scheduled} scheduled · ${completed} done`} />
        <MiniStat icon={Bell} label="Unread alerts" value={unread ?? 0} tone={unread ? "warning" : undefined} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {isLoading ? (
          <>
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
          </>
        ) : (children ?? []).length === 0 ? (
          <div className="lg:col-span-2">
            <EmptyState
              title="No children linked"
              description="No student is registered with your mobile number. Please contact your school."
            />
          </div>
        ) : (
          (children ?? []).map((c) => {
            const trip = (todayTrips ?? []).find((t) => (t as { route_id: string }).route_id === c.route_id) as
              | { id: string; status: string; trip_type: string; expected_start_time: string | null }
              | undefined;
            return (
              <Card key={c.id}>
                <CardHeader className="flex-row items-center gap-3 space-y-0">
                  <Avatar className="h-12 w-12">
                    <AvatarImage src={c.photo_url ?? undefined} />
                    <AvatarFallback>{c.full_name.slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <CardTitle className="text-base">{c.full_name}</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      {c.grade ? `Grade ${c.grade}` : ""}{c.class_section ? ` · ${c.class_section}` : ""}
                      {c.schools?.name ? ` · ${c.schools.name}` : ""}
                    </p>
                  </div>
                  {trip ? (
                    <Badge variant={trip.status === "in_progress" ? "default" : "secondary"} className="capitalize">
                      {trip.status.replace("_", " ")}
                    </Badge>
                  ) : (
                    <Badge variant="outline">No trip today</Badge>
                  )}
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <Field icon={SchoolIcon} label="Route" value={c.routes?.name ?? "Not assigned"} />
                  <Field icon={Bus} label="Vehicle" value={c.vehicles?.registration_number ?? "—"} />
                  <Field icon={MapPin} label="Pickup" value={c.pickup_address ?? "—"} />
                  <div className="flex gap-2 pt-2">
                    <Link
                      to="/parent/child"
                      className="flex-1 rounded-md border px-3 py-2 text-center text-xs hover:bg-accent"
                    >
                      Details
                    </Link>
                    <Link
                      to="/parent/live"
                      className="flex-1 rounded-md border px-3 py-2 text-center text-xs hover:bg-accent"
                    >
                      Live bus
                    </Link>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </>
  );
}

function MiniStat({
  icon: Icon,
  label,
  value,
  sub,
  loading,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  sub?: string;
  loading?: boolean;
  tone?: "success" | "warning";
}) {
  const toneCls = tone === "success" ? "text-emerald-600" : tone === "warning" ? "text-amber-600" : "";
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="h-4 w-4" /> {label}
      </div>
      <div className={`mt-2 text-2xl font-semibold ${toneCls}`}>{loading ? "—" : value}</div>
      {sub ? <div className="mt-1 text-xs text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

function Field({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="truncate">{value}</div>
      </div>
    </div>
  );
}
