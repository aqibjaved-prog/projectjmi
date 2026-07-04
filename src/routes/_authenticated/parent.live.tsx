import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Baby, Clock, Gauge, MapPin, Navigation as NavIcon, RefreshCcw } from "lucide-react";
import { isGoogleMapsConfigured, loadGoogleMaps } from "@/lib/google-maps-loader";
import { normalizeTrip, type TripRow } from "@/lib/trips";
import { useParentChildren } from "@/hooks/use-parent-children";
import { useTripAttendance } from "@/hooks/use-trip-attendance";

export const Route = createFileRoute("/_authenticated/parent/live")({
  head: () => ({ meta: [{ title: "Live bus tracking" }] }),
  component: ParentLivePage,
});

function ParentLivePage() {
  const { data: children, isLoading } = useParentChildren();
  const [childId, setChildId] = useState<string | null>(null);
  const child = children?.find((c) => c.id === childId) ?? children?.[0];

  const qc = useQueryClient();
  const { data: trip, refetch } = useQuery({
    enabled: !!child?.route_id,
    queryKey: ["parent-live-trip", child?.route_id],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("trips")
        .select("*")
        .eq("route_id", child!.route_id!)
        .eq("trip_date", today)
        .order("expected_start_time", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data ? normalizeTrip(data as Record<string, unknown>) : null;
    },
    refetchInterval: 10_000,
  });

  // Realtime subscription for this trip's live_location
  useEffect(() => {
    if (!trip?.id) return;
    const ch = supabase
      .channel(`parent-live:${trip.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "trips", filter: `id=eq.${trip.id}` },
        () => qc.invalidateQueries({ queryKey: ["parent-live-trip", child?.route_id] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip?.id, child?.route_id]);

  const { data: attendanceData } = useTripAttendance(trip?.id ?? null);
  const myStatus = child && attendanceData ? attendanceData.byStudent[child.id]?.event_type ?? "waiting" : "waiting";

  if (isLoading) return <Skeleton className="h-96" />;
  if (!children || children.length === 0) {
    return (
      <>
        <PageHeader title="Live bus tracking" description="See where your child's bus is right now." />
        <EmptyState title="No children linked" description="Contact your school to register your mobile number." />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Live bus tracking"
        description="Real-time location and attendance updates."
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCcw className="mr-2 h-4 w-4" /> Refresh
          </Button>
        }
      />

      {children.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {children.map((c) => {
            const active = (child?.id) === c.id;
            return (
              <Button key={c.id} size="sm" variant={active ? "default" : "outline"} onClick={() => setChildId(c.id)}>
                <Baby className="mr-2 h-4 w-4" /> {c.full_name}
              </Button>
            );
          })}
        </div>
      )}

      {!trip ? (
        <EmptyState
          title="No trip scheduled today"
          description={`No trip is scheduled today for ${child?.full_name ?? "your child"}.`}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <NavIcon className="h-4 w-4" /> Live map
                <Badge variant={trip.status === "in_progress" ? "default" : "secondary"} className="ml-auto capitalize">
                  {trip.status.replace("_", " ")}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <LiveMap trip={trip} />
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Attendance</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <StatusRow label={child?.full_name ?? "Child"} status={myStatus} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Trip details</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Info icon={Clock} label="Started" value={trip.started_at ? new Date(trip.started_at).toLocaleTimeString() : "—"} />
                <Info icon={Clock} label="Expected start" value={trip.expected_start_time ?? "—"} />
                <Info icon={Gauge} label="Speed" value={trip.live_location?.speed_kmh != null ? `${Math.round(trip.live_location.speed_kmh)} km/h` : "—"} />
                <Info icon={MapPin} label="Next stop" value={nextStop(trip)} />
                <Info icon={Clock} label="Last update" value={trip.live_location?.recorded_at ? new Date(trip.live_location.recorded_at).toLocaleTimeString() : "—"} />
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}

function StatusRow({ label, status }: { label: string; status: string }) {
  const tone: Record<string, { v: "default" | "secondary" | "destructive" | "outline"; text: string }> = {
    waiting: { v: "outline", text: "Waiting" },
    boarded: { v: "default", text: "Boarded" },
    late: { v: "secondary", text: "Late" },
    absent: { v: "destructive", text: "Absent" },
    dropped: { v: "secondary", text: "Dropped" },
    wrong_stop: { v: "destructive", text: "Wrong stop" },
  };
  const t = tone[status] ?? tone.waiting;
  return (
    <div className="flex items-center justify-between">
      <span>{label}</span>
      <Badge variant={t.v}>{t.text}</Badge>
    </div>
  );
}

function Info({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <span className="text-muted-foreground">{label}:</span>
      <span className="ml-auto font-medium">{value}</span>
    </div>
  );
}

function nextStop(trip: TripRow): string {
  const next = trip.stop_progress?.find((s) => s.status === "pending" || s.status === "reached");
  return next?.name ?? (trip.status === "completed" ? "Completed" : "—");
}

function LiveMap({ trip }: { trip: TripRow }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const vehicleRef = useRef<google.maps.Marker | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const configured = isGoogleMapsConfigured();

  useEffect(() => {
    if (!configured || !ref.current) return;
    let cancelled = false;
    loadGoogleMaps(["geometry"]).then((g) => {
      if (cancelled || !ref.current) return;
      const center = trip.live_location
        ? { lat: trip.live_location.lat, lng: trip.live_location.lng }
        : { lat: 12.9716, lng: 77.5946 };
      const m = new g.maps.Map(ref.current, { center, zoom: 14, streetViewControl: false });
      mapRef.current = m;
      setReady(true);
    }).catch((e: unknown) => setErr(e instanceof Error ? e.message : "Failed to load map"));
    return () => { cancelled = true; };
  }, [configured]); // eslint-disable-line

  useEffect(() => {
    if (!ready || !mapRef.current || typeof google === "undefined") return;
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];
    const bounds = new google.maps.LatLngBounds();

    (trip.stop_progress ?? []).forEach((s, i) => {
      if (s.lat == null || s.lng == null) return;
      const p = { lat: Number(s.lat), lng: Number(s.lng) };
      const color = s.status === "departed" ? "#10b981" : s.status === "reached" ? "#f59e0b" : "#3b82f6";
      markersRef.current.push(new google.maps.Marker({
        position: p, map: mapRef.current!, title: s.name,
        label: { text: String(i + 1), color: "#fff", fontSize: "11px" },
        icon: { path: google.maps.SymbolPath.CIRCLE, scale: 12, fillColor: color, fillOpacity: 1, strokeColor: "#fff", strokeWeight: 2 },
      }));
      bounds.extend(p);
    });

    if (vehicleRef.current) { vehicleRef.current.setMap(null); vehicleRef.current = null; }
    if (trip.live_location) {
      const p = { lat: trip.live_location.lat, lng: trip.live_location.lng };
      vehicleRef.current = new google.maps.Marker({
        position: p, map: mapRef.current!, title: "Bus",
        icon: { path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW, scale: 6, fillColor: "#ef4444", fillOpacity: 1, strokeColor: "#fff", strokeWeight: 2, rotation: trip.live_location.heading ?? 0 },
        zIndex: 999,
      });
      bounds.extend(p);
    }
    if (!bounds.isEmpty()) mapRef.current.fitBounds(bounds, 60);
  }, [ready, trip.stop_progress, trip.live_location]);

  if (!configured) {
    return <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">Google Maps is not configured.</div>;
  }
  return (
    <div className="space-y-2">
      {err && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{err}</div>}
      <div ref={ref} className="h-[420px] w-full rounded-md border bg-muted" />
    </div>
  );
}
