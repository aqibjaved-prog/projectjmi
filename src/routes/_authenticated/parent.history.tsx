import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Baby } from "lucide-react";
import { useParentChildren } from "@/hooks/use-parent-children";

export const Route = createFileRoute("/_authenticated/parent/history")({
  head: () => ({ meta: [{ title: "Trip history" }] }),
  component: ParentHistoryPage,
});

interface HistoryTrip {
  id: string;
  trip_date: string;
  trip_type: string;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  route_id: string;
  vehicle_id: string | null;
  driver_id: string | null;
}

function ParentHistoryPage() {
  const { data: children } = useParentChildren();
  const [childId, setChildId] = useState<string | null>(null);
  const child = children?.find((c) => c.id === childId) ?? children?.[0];

  const { data: trips, isLoading } = useQuery({
    enabled: !!child?.route_id,
    queryKey: ["parent-history", child?.route_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trips")
        .select("id, trip_date, trip_type, status, started_at, ended_at, route_id, vehicle_id, driver_id")
        .eq("route_id", child!.route_id!)
        .order("trip_date", { ascending: false })
        .limit(60);
      if (error) throw error;
      return (data ?? []) as HistoryTrip[];
    },
  });

  const tripIds = useMemo(() => (trips ?? []).map((t) => t.id), [trips]);

  const { data: attendanceMap } = useQuery({
    enabled: !!child && tripIds.length > 0,
    queryKey: ["parent-history-attendance", child?.id, tripIds.sort().join(",")],
    queryFn: async () => {
      const { data } = await supabase
        .from("qr_logs")
        .select("trip_id, event_type, scanned_at")
        .eq("student_id", child!.id)
        .in("trip_id", tripIds)
        .order("scanned_at", { ascending: true });
      const byTrip: Record<string, string> = {};
      for (const row of (data ?? []) as Array<{ trip_id: string; event_type: string }>) {
        byTrip[row.trip_id] = row.event_type;
      }
      return byTrip;
    },
  });

  const { data: driverMap } = useQuery({
    enabled: tripIds.length > 0,
    queryKey: ["parent-history-drivers", tripIds.sort().join(",")],
    queryFn: async () => {
      const driverIds = Array.from(new Set((trips ?? []).map((t) => t.driver_id).filter((v): v is string => !!v)));
      if (!driverIds.length) return {} as Record<string, string>;
      const { data } = await supabase.from("drivers").select("id, full_name").in("id", driverIds);
      return Object.fromEntries((data ?? []).map((d) => [d.id, d.full_name])) as Record<string, string>;
    },
  });

  const { data: vehicleMap } = useQuery({
    enabled: tripIds.length > 0,
    queryKey: ["parent-history-vehicles", tripIds.sort().join(",")],
    queryFn: async () => {
      const vIds = Array.from(new Set((trips ?? []).map((t) => t.vehicle_id).filter((v): v is string => !!v)));
      if (!vIds.length) return {} as Record<string, string>;
      const { data } = await supabase.from("vehicles").select("id, registration_number").in("id", vIds);
      return Object.fromEntries((data ?? []).map((v) => [v.id, v.registration_number ?? "—"])) as Record<string, string>;
    },
  });

  return (
    <>
      <PageHeader title="Trip history" description="Past pickup and drop trips." />

      {(children ?? []).length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {children!.map((c) => {
            const active = (child?.id) === c.id;
            return (
              <Button key={c.id} size="sm" variant={active ? "default" : "outline"} onClick={() => setChildId(c.id)}>
                <Baby className="mr-2 h-4 w-4" /> {c.full_name}
              </Button>
            );
          })}
        </div>
      )}

      {isLoading ? (
        <Skeleton className="h-64" />
      ) : !trips || trips.length === 0 ? (
        <EmptyState title="No trips yet" description="Trip history will appear here once your child starts riding." />
      ) : (
        <Card>
          <CardHeader><CardTitle className="text-base">Recent trips</CardTitle></CardHeader>
          <CardContent className="divide-y">
            {trips.map((t) => {
              const status = attendanceMap?.[t.id] ?? "—";
              return (
                <div key={t.id} className="grid grid-cols-2 gap-2 py-3 text-sm sm:grid-cols-6">
                  <div>
                    <div className="text-xs text-muted-foreground">Date</div>
                    <div className="font-medium">{t.trip_date}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Type</div>
                    <div className="capitalize">{t.trip_type}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Start</div>
                    <div>{t.started_at ? new Date(t.started_at).toLocaleTimeString() : "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">End</div>
                    <div>{t.ended_at ? new Date(t.ended_at).toLocaleTimeString() : "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Driver / Vehicle</div>
                    <div className="truncate">
                      {(t.driver_id && driverMap?.[t.driver_id]) || "—"} · {(t.vehicle_id && vehicleMap?.[t.vehicle_id]) || "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Attendance</div>
                    <Badge variant={status === "boarded" || status === "dropped" ? "default" : status === "absent" ? "destructive" : "secondary"} className="capitalize">
                      {status.replace("_", " ")}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </>
  );
}
