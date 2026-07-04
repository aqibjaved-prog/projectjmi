import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  useDriverTrip, useDriverStudents, useMyDriver, patchDriverTrip, type DriverTripRow,
} from "@/lib/driver-portal";
import {
  tripStatusLabel, tripTypeLabel, makeEvent, delayMinutes, delayLabel,
  type TripLiveLocation, type TripStopProgress,
} from "@/lib/trips";
import { useTripAttendance, type AttendanceEventType } from "@/hooks/use-trip-attendance";
import { loadGoogleMaps, isGoogleMapsConfigured } from "@/lib/google-maps-loader";
import {
  ArrowLeft, Gauge, MapPin, Navigation as NavIcon, Pause, Play, Square, Users,
  CheckCircle2, Clock, UserX, QrCode,
} from "lucide-react";
import { SosButton } from "./driver.dashboard";

export const Route = createFileRoute("/_authenticated/driver/trip/$tripId")({
  head: () => ({ meta: [{ title: "Live Trip" }] }),
  component: LiveTripPage,
});

function LiveTripPage() {
  const { tripId } = Route.useParams();
  const { data: trip, isLoading } = useDriverTrip(tripId);
  const { data: students } = useDriverStudents();
  const qc = useQueryClient();

  const invalidate = () => qc.invalidateQueries({ queryKey: ["driver-portal"] });

  const isLive = trip?.status === "in_progress";
  const isPaused = trip?.status === "paused";

  // GPS tracking — updates trips.live_location every 10s while trip is live.
  useGpsTracker(tripId, isLive);

  const pause = useMutation({
    mutationFn: async () => {
      if (!trip) return;
      await patchDriverTrip(trip.id, { status: "paused", timeline: [...trip.timeline, makeEvent("trip.paused", "Trip paused")] });
    },
    onSuccess: () => { toast.success("Trip paused"); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const resume = useMutation({
    mutationFn: async () => {
      if (!trip) return;
      await patchDriverTrip(trip.id, { status: "in_progress", timeline: [...trip.timeline, makeEvent("trip.resumed", "Trip resumed")] });
    },
    onSuccess: () => { toast.success("Trip resumed"); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const end = useMutation({
    mutationFn: async () => {
      if (!trip) return;
      await patchDriverTrip(trip.id, {
        status: "completed", ended_at: new Date().toISOString(),
        timeline: [...trip.timeline, makeEvent("trip.completed", "Trip ended by driver")],
      });
    },
    onSuccess: () => { toast.success("Trip ended"); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const markStop = useMutation({
    mutationFn: async ({ stopId, action, boarded, missing }: { stopId: string; action: "arrive" | "depart" | "skip"; boarded?: number; missing?: number }) => {
      if (!trip) return;
      const now = new Date().toISOString();
      const stops = trip.stop_progress.map((s) => {
        if (s.stop_id !== stopId) return s;
        if (action === "arrive") return { ...s, actual_arrival: now, status: "reached" as const };
        if (action === "skip") return { ...s, status: "skipped" as const, actual_departure: now };
        return { ...s, actual_departure: now, status: "departed" as const, students_boarded: boarded ?? s.students_boarded, students_missing: missing ?? s.students_missing };
      });
      const stop = stops.find((s) => s.stop_id === stopId);
      const msg = action === "arrive" ? `Reached ${stop?.name}` : action === "skip" ? `Skipped ${stop?.name}` : `Departed ${stop?.name}`;
      const et = action === "arrive" ? "stop.reached" : action === "skip" ? "stop.skipped" : "stop.departed";
      await patchDriverTrip(trip.id, { stop_progress: stops, timeline: [...trip.timeline, makeEvent(et, msg)] });
    },
    onSuccess: () => { toast.success("Stop updated"); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const studentStatus = useMutation({
    mutationFn: async ({ studentId, status }: { studentId: string; status: "boarded" | "absent" | "not_present" | "late" | "dropped" | "wrong_stop" }) => {
      if (!trip) return;
      const meta = (trip.metadata ?? {}) as any;
      const attendance = (meta.attendance ?? {}) as Record<string, string>;
      attendance[studentId] = status;
      const timeline = [...trip.timeline, makeEvent(`student.${status}`, `Student ${studentId} marked ${status}`, { studentId })];
      await patchDriverTrip(trip.id, { metadata: { ...meta, attendance }, timeline });
    },
    onSuccess: () => invalidate(),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (!trip) return <EmptyState title="Trip not found" description="This trip may have been deleted or you don't have access." />;

  const nextStop = trip.stop_progress.find((s) => s.status !== "departed" && s.status !== "skipped");
  const remaining = trip.stop_progress.filter((s) => s.status !== "departed" && s.status !== "skipped").length;
  const attendance = ((trip.metadata as any)?.attendance ?? {}) as Record<string, string>;
  const picked = Object.values(attendance).filter((s) => s === "boarded").length;
  const routeStudents = (students ?? []).filter((s) => s.route_id === trip.route_id);

  return (
    <div className="space-y-4">
      <PageHeader
        title={trip.name ?? trip.routes?.name ?? "Live trip"}
        description={`${tripTypeLabel(trip.trip_type)} · ${trip.trip_date} · ${trip.trip_code ?? ""}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" asChild><Link to="/driver/today"><ArrowLeft className="mr-2 h-4 w-4" /> Back</Link></Button>
            {isLive && <Button variant="outline" onClick={() => pause.mutate()}><Pause className="mr-2 h-4 w-4" /> Pause</Button>}
            {isPaused && <Button onClick={() => resume.mutate()}><Play className="mr-2 h-4 w-4" /> Resume</Button>}
            {(isLive || isPaused) && (
              <Button variant="destructive" onClick={() => { if (confirm("End this trip?")) end.mutate(); }}>
                <Square className="mr-2 h-4 w-4" /> End
              </Button>
            )}
            <SosButton activeTripId={isLive || isPaused ? trip.id : null} />
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Status" value={tripStatusLabel(trip.status)} />
        <StatCard label="Speed" value={trip.live_location?.speed_kmh != null ? `${trip.live_location.speed_kmh} km/h` : "—"} icon={Gauge} />
        <StatCard label="Next stop" value={nextStop?.name ?? "—"} sub={nextStop?.scheduled_arrival ?? undefined} />
        <StatCard label="Students picked" value={`${picked} / ${routeStudents.length}`} sub={`${remaining} stops remaining`} icon={Users} />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2"><MapPin className="h-4 w-4" /> Live map</CardTitle>
          {nextStop?.lat != null && nextStop?.lng != null && (
            <Button size="sm" variant="outline" asChild>
              <a href={`https://www.google.com/maps/dir/?api=1&destination=${nextStop.lat},${nextStop.lng}&travelmode=driving`} target="_blank" rel="noreferrer">
                <NavIcon className="mr-2 h-4 w-4" /> Navigate to next stop
              </a>
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <TripMap trip={trip} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Stops</CardTitle></CardHeader>
        <CardContent>
          <StopList trip={trip} canManage={isLive} onArrive={(id) => markStop.mutate({ stopId: id, action: "arrive" })} onDepart={(id, b, m) => markStop.mutate({ stopId: id, action: "depart", boarded: b, missing: m })} onSkip={(id) => { if (confirm("Skip this stop?")) markStop.mutate({ stopId: id, action: "skip" }); }} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4" /> Students on this trip</CardTitle></CardHeader>
        <CardContent>
          {routeStudents.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">No students on this route.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead>Pickup</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[280px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {routeStudents.map((s) => {
                  const st = attendance[s.id];
                  const isDrop = trip.trip_type === "drop";
                  return (
                    <TableRow key={s.id}>
                      <TableCell>
                        <div className="font-medium">{s.full_name}</div>
                        <div className="text-xs text-muted-foreground">{s.student_code ?? "—"}</div>
                      </TableCell>
                      <TableCell>{[s.grade, s.class_section].filter(Boolean).join(" · ") || "—"}</TableCell>
                      <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">{s.pickup_address ?? "—"}</TableCell>
                      <TableCell>{st ? <Badge variant="outline" className="capitalize">{st.replace("_", " ")}</Badge> : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {!isDrop ? (
                            <>
                              <Button size="sm" variant="outline" disabled={!isLive} onClick={() => studentStatus.mutate({ studentId: s.id, status: "boarded" })}>Boarded</Button>
                              <Button size="sm" variant="outline" disabled={!isLive} onClick={() => studentStatus.mutate({ studentId: s.id, status: "absent" })}>Absent</Button>
                              <Button size="sm" variant="outline" disabled={!isLive} onClick={() => studentStatus.mutate({ studentId: s.id, status: "late" })}>Late</Button>
                            </>
                          ) : (
                            <>
                              <Button size="sm" variant="outline" disabled={!isLive} onClick={() => studentStatus.mutate({ studentId: s.id, status: "dropped" })}>Dropped</Button>
                              <Button size="sm" variant="outline" disabled={!isLive} onClick={() => studentStatus.mutate({ studentId: s.id, status: "absent" })}>Absent</Button>
                              <Button size="sm" variant="destructive" disabled={!isLive} onClick={() => studentStatus.mutate({ studentId: s.id, status: "wrong_stop" })}>Wrong stop</Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Timeline</CardTitle></CardHeader>
        <CardContent>
          {trip.timeline.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">No events yet.</div>
          ) : (
            <ol className="space-y-2">
              {[...trip.timeline].reverse().slice(0, 30).map((e) => (
                <li key={e.id} className="rounded-md border p-2 text-sm">
                  <div className="font-medium">{e.message}</div>
                  <div className="text-xs text-muted-foreground">{new Date(e.at).toLocaleString()}</div>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value, sub, icon: Icon }: { label: string; value: string; sub?: string; icon?: any }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        {Icon && <div className="grid h-10 w-10 place-items-center rounded-md bg-muted"><Icon className="h-5 w-5" /></div>}
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="truncate font-medium">{value}</div>
          {sub && <div className="truncate text-xs text-muted-foreground">{sub}</div>}
        </div>
      </CardContent>
    </Card>
  );
}

/* ---------- Stop list ---------- */

function StopList({
  trip, canManage, onArrive, onDepart, onSkip,
}: {
  trip: DriverTripRow;
  canManage: boolean;
  onArrive: (id: string) => void;
  onDepart: (id: string, boarded: number, missing: number) => void;
  onSkip: (id: string) => void;
}) {
  const stops = trip.stop_progress ?? [];
  if (stops.length === 0) return <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">No stops on this route.</div>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>#</TableHead>
          <TableHead>Stop</TableHead>
          <TableHead>ETA</TableHead>
          <TableHead>Actual</TableHead>
          <TableHead>Delay</TableHead>
          <TableHead>Status</TableHead>
          {canManage && <TableHead className="w-[260px]">Action</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {stops.map((s, i) => {
          const d = delayMinutes(s.scheduled_arrival, s.actual_arrival, trip.trip_date);
          const dl = delayLabel(d);
          return (
            <TableRow key={s.stop_id}>
              <TableCell>{i + 1}</TableCell>
              <TableCell className="font-medium">{s.name}</TableCell>
              <TableCell>{s.scheduled_arrival ?? "—"}</TableCell>
              <TableCell>{s.actual_arrival ? new Date(s.actual_arrival).toLocaleTimeString() : "—"}</TableCell>
              <TableCell><Badge variant={dl.tone === "destructive" ? "destructive" : "outline"}>{dl.label}</Badge></TableCell>
              <TableCell><Badge variant="outline">{s.status ?? "pending"}</Badge></TableCell>
              {canManage && (
                <TableCell>
                  {!s.actual_arrival && (
                    <div className="flex gap-1">
                      <Button size="sm" onClick={() => onArrive(s.stop_id)}>Arrive</Button>
                      <Button size="sm" variant="outline" onClick={() => onSkip(s.stop_id)}>Skip</Button>
                    </div>
                  )}
                  {s.actual_arrival && !s.actual_departure && (
                    <DepartInline stop={s} onDepart={(b, m) => onDepart(s.stop_id, b, m)} />
                  )}
                  {s.actual_departure && <Badge variant="secondary">Done</Badge>}
                </TableCell>
              )}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function DepartInline({ stop, onDepart }: { stop: TripStopProgress; onDepart: (b: number, m: number) => void }) {
  const [b, setB] = useState(stop.students_boarded ?? 0);
  const [m, setM] = useState(stop.students_missing ?? 0);
  return (
    <div className="flex items-center gap-1">
      <Label className="sr-only">Boarded</Label>
      <Input className="h-9 w-16" type="number" min={0} value={b} onChange={(e) => setB(Number(e.target.value) || 0)} />
      <Input className="h-9 w-16" type="number" min={0} value={m} onChange={(e) => setM(Number(e.target.value) || 0)} />
      <Button size="sm" onClick={() => onDepart(b, m)}>Depart</Button>
    </div>
  );
}

/* ---------- Google Map ---------- */

function TripMap({ trip }: { trip: DriverTripRow }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const vehicleRef = useRef<google.maps.Marker | null>(null);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const configured = isGoogleMapsConfigured();

  useEffect(() => {
    if (!configured || !ref.current) return;
    let cancelled = false;
    loadGoogleMaps(["places", "geometry"]).then((g) => {
      if (cancelled || !ref.current) return;
      const start = trip.routes?.start_lat != null ? { lat: Number(trip.routes.start_lat), lng: Number(trip.routes.start_lng) } : { lat: 12.9716, lng: 77.5946 };
      mapRef.current = new g.maps.Map(ref.current, { center: start, zoom: 13, streetViewControl: false });
      setReady(true);
    }).catch((e: unknown) => setErr(e instanceof Error ? e.message : "Failed to load map"));
    return () => { cancelled = true; };
  }, [configured, trip.routes?.start_lat, trip.routes?.start_lng]);

  useEffect(() => {
    if (!ready || !mapRef.current || typeof google === "undefined") return;
    const map = mapRef.current;
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];
    const bounds = new google.maps.LatLngBounds();
    (trip.stop_progress ?? []).forEach((s, i) => {
      if (s.lat == null || s.lng == null) return;
      const p = { lat: Number(s.lat), lng: Number(s.lng) };
      const color = s.status === "departed" ? "#10b981" : s.status === "reached" ? "#f59e0b" : "#3b82f6";
      markersRef.current.push(new google.maps.Marker({
        position: p, map, title: s.name,
        label: { text: String(i + 1), color: "#fff", fontSize: "11px" },
        icon: { path: google.maps.SymbolPath.CIRCLE, scale: 12, fillColor: color, fillOpacity: 1, strokeColor: "#fff", strokeWeight: 2 },
      }));
      bounds.extend(p);
    });
    if (vehicleRef.current) { vehicleRef.current.setMap(null); vehicleRef.current = null; }
    if (trip.live_location) {
      const p = { lat: trip.live_location.lat, lng: trip.live_location.lng };
      vehicleRef.current = new google.maps.Marker({
        position: p, map, title: "You",
        icon: { path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW, scale: 5, fillColor: "#ef4444", fillOpacity: 1, strokeColor: "#fff", strokeWeight: 2, rotation: trip.live_location.heading ?? 0 },
        zIndex: 999,
      });
      bounds.extend(p);
    }
    if (!bounds.isEmpty()) map.fitBounds(bounds, 40);
  }, [ready, trip.stop_progress, trip.live_location]);

  if (!configured) return <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">Google Maps is not configured.</div>;
  return (
    <div className="space-y-2">
      {err && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{err}</div>}
      <div ref={ref} className="h-[360px] w-full rounded-md border bg-muted" />
    </div>
  );
}

/* ---------- GPS tracker ---------- */

function useGpsTracker(tripId: string, active: boolean) {
  const lastSent = useRef<number>(0);
  useEffect(() => {
    if (!active) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      async (pos) => {
        // Throttle to one update per 8s.
        if (Date.now() - lastSent.current < 8_000) return;
        lastSent.current = Date.now();
        const loc: TripLiveLocation = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          speed_kmh: pos.coords.speed != null ? Math.round(pos.coords.speed * 3.6) : null,
          heading: pos.coords.heading != null && !Number.isNaN(pos.coords.heading) ? Math.round(pos.coords.heading) : null,
          recorded_at: new Date().toISOString(),
        };
        try { await patchDriverTrip(tripId, { live_location: loc }); } catch { /* ignore transient */ }
      },
      () => { /* permission denied or unavailable — silent */ },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [tripId, active]);
}

// Silence unused import
void useMemo;
