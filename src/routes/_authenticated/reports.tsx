import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeader, EmptyState } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, UserCog, Car, MapPin, Calendar, Bell } from "lucide-react";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({ meta: [{ title: "Reports — School Van Guardian" }] }),
  component: ReportsPage,
});

function ReportsPage() {
  const { schoolId, primaryRole } = useAuth();

  const { data, isLoading } = useQuery({
    enabled: !!schoolId,
    queryKey: ["school-reports", schoolId],
    queryFn: async () => {
      if (!schoolId) return null;
      const since = new Date(); since.setDate(since.getDate() - 30);
      const sinceIso = since.toISOString().slice(0, 10);

      const [students, drivers, vehicles, routes, tripsMonth, tripsCompleted, notifs30] = await Promise.all([
        supabase.from("students").select("id", { count: "exact", head: true }).eq("school_id", schoolId).eq("is_active", true),
        supabase.from("drivers").select("id", { count: "exact", head: true }).eq("school_id", schoolId).eq("is_active", true),
        supabase.from("vehicles").select("id", { count: "exact", head: true }).eq("school_id", schoolId).eq("is_active", true),
        supabase.from("routes").select("id", { count: "exact", head: true }).eq("school_id", schoolId).eq("is_active", true),
        supabase.from("trips").select("id", { count: "exact", head: true }).eq("school_id", schoolId).gte("trip_date", sinceIso),
        supabase.from("trips").select("id", { count: "exact", head: true }).eq("school_id", schoolId).gte("trip_date", sinceIso).eq("status", "completed"),
        supabase.from("notifications").select("id", { count: "exact", head: true }).eq("school_id", schoolId).gte("created_at", since.toISOString()),
      ]);

      return {
        students: students.count ?? 0,
        drivers: drivers.count ?? 0,
        vehicles: vehicles.count ?? 0,
        routes: routes.count ?? 0,
        tripsMonth: tripsMonth.count ?? 0,
        tripsCompleted: tripsCompleted.count ?? 0,
        notifs30: notifs30.count ?? 0,
      };
    },
  });

  if (primaryRole !== "school_admin") {
    return <EmptyState title="Not available" description="Reports are only available for school administrators." />;
  }

  const completionRate = data && data.tripsMonth > 0
    ? Math.round((data.tripsCompleted / data.tripsMonth) * 100)
    : 0;

  return (
    <>
      <PageHeader title="Reports" description="Overview of operations for the last 30 days." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Active students" value={data?.students} icon={Users} loading={isLoading} />
        <StatCard label="Active drivers" value={data?.drivers} icon={UserCog} loading={isLoading} />
        <StatCard label="Active vehicles" value={data?.vehicles} icon={Car} loading={isLoading} />
        <StatCard label="Active routes" value={data?.routes} icon={MapPin} loading={isLoading} />
        <StatCard label="Trips (30d)" value={data?.tripsMonth} icon={Calendar} loading={isLoading} />
        <StatCard label="Completed trips" value={data?.tripsCompleted} icon={Calendar} loading={isLoading} tone="success" />
        <StatCard label="Completion rate" value={data ? `${completionRate}%` : undefined} icon={Calendar} loading={isLoading} />
        <StatCard label="Notifications (30d)" value={data?.notifs30} icon={Bell} loading={isLoading} />
      </div>

      <Card className="mt-6">
        <CardHeader><CardTitle>About reports</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Detailed exportable reports (per-route usage, per-driver hours, per-student attendance) will appear here as
          the corresponding modules are populated.
        </CardContent>
      </Card>
    </>
  );
}
