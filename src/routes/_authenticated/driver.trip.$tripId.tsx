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
import {
  TripCompletionDialog, CompletedTripBanner, type CompletionStats,
} from "@/components/driver/trip-completion-dialog";

export const Route = createFileRoute("/_authenticated/driver/trip/$tripId")({
  head: () => ({ meta: [{ title: "Live Trip" }] }),
  component: LiveTripPage,
});

function LiveTripPage() {
  const { tripId } = Route.useParams();
  const { data: trip, isLoading } = useDriverTrip(tripId);
  const { data: students } = useDriverStudents();
  const { data: driver } = useMyDriver();
  const { data: attendanceData } = useTripAttendance(tripId);
  const qc = useQueryClient();

  const invalidate = () => qc.invalidateQueries({ queryKey: ["driver-portal"] });
  const invalidateAttendance = () => qc.invalidateQueries({ queryKey: ["trip-attendance", tripId] });

  const isLive = trip?.status === "in_progress";
  const isPaused = trip?.status === "paused";

  // GPS tracking — updates trips.live_location every 10s while trip is live.
  useGpsTracker(tripId, isLive);

  const routeStudents = useMemo(
    () => (students ?? []).filter((s) => s.route_id === trip?.route_id),
    [students, trip?.route_id],
  );

  const attendance = attendanceData?.byStudent ?? {};
  const counts = attendanceData?.counts ?? { boarded: 0, late: 0, absent: 0, dropped: 0, wrong_stop: 0 };
  const totalStudents = routeStudents.length;
  const isDrop = trip?.trip_type === "drop";
  const presentCount = isDrop ? counts.dropped : counts.boarded + counts.late;
  const remainingStudents = Math.max(0, totalStudents - presentCount - counts.absent - counts.wrong_stop);

  // Auto-mark unscanned students as absent for the given student ids.
  async function markUnscannedAbsent(studentIds: string[], reason: string) {
    if (!trip || !driver || studentIds.length === 0) return 0;
    const unscanned = studentIds.filter((id) => !attendance[id]);
    if (unscanned.length === 0) return 0;
    const rows = unscanned.map((student_id) => ({
      school_id: driver.school_id,
      driver_id: driver.id,
      trip_id: trip.id,
      student_id,
      event_type: "absent" as const,
      scanned_at: new Date().toISOString(),
      location: null,
    }));
    const { error } = await supabase.from("qr_logs").insert(rows);
    if (error) throw error;
    // Log to trip timeline
    await patchDriverTrip(trip.id, {
      timeline: [
        ...trip.timeline,
        makeEvent("students.auto_absent", `Auto-marked ${unscanned.length} student(s) absent — ${reason}`, {
          count: unscanned.length,
        }),
      ],
    });
    return unscanned.length;
  }

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
  const [completionOpen, setCompletionOpen] = useState(false);
  const end = useMutation({
    mutationFn: async (stats: CompletionStats) => {
      if (!trip) return { absent: 0 };
      // Auto-mark any student without a scan as absent.
      const absentCount = await markUnscannedAbsent(routeStudents.map((s) => s.id), "trip ended");
      const endedAt = stats.actual_end;
      // Recompute absent for the final summary (may include the auto-absents we just inserted).
      const finalStats: CompletionStats = {
        ...stats,
        absent: stats.absent + absentCount,
        remaining: Math.max(0, stats.remaining - absentCount),
      };
      await patchDriverTrip(trip.id, {
        status: "completed",
        ended_at: endedAt,
        metadata: {
          ...(trip.metadata ?? {}),
          completion_summary: finalStats,
          completed_by: driver?.id ?? null,
          completed_at: endedAt,
          locked: true,
        },
        timeline: [
          ...trip.timeline,
          makeEvent("trip.completed", "Trip ended by driver", {
            distance_km: finalStats.distance_km,
            duration_min: finalStats.duration_min,
            boarded: finalStats.boarded,
            dropped: finalStats.dropped,
            absent: finalStats.absent,
            late: finalStats.late,
          }),
        ],
      });
      return { absent: absentCount };
    },
    onSuccess: ({ absent }) => {
      toast.success(absent ? `Trip completed · ${absent} student(s) auto-marked absent` : "Trip completed");
      setCompletionOpen(false);
      invalidate();
      invalidateAttendance();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const markStop = useMutation({
    mutationFn: async ({ stopId, action, boarded, missing }: { stopId: string; action: "arrive" | "depart" | "skip"; boarded?: number; missing?: number }) => {
      if (!trip) return { absent: 0, action };
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

      // Auto-absent: when the LAST remaining stop is departed or skipped, mark
      // every student still without a scan as absent (student→stop mapping
      // is not stored today, so we treat "route done" as the trigger).
      let absent = 0;
      const stillOpen = stops.some((s) => s.status !== "departed" && s.status !== "skipped");
      if (!stillOpen && (action === "depart" || action === "skip")) {
        absent = await markUnscannedAbsent(routeStudents.map((s) => s.id), `left last stop (${stop?.name ?? ""})`);
      }
      return { absent, action };
    },
    onSuccess: ({ absent }) => {
      toast.success(absent ? `Stop updated · ${absent} unscanned marked absent` : "Stop updated");
      invalidate();
      invalidateAttendance();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  // Drop-trip actions still update qr_logs directly. Boarded/Absent/Late are
  // no longer manual — Boarded comes from the QR scanner, Absent from the
  // auto-absent flow, Late from a delayed scan.
  const studentStatus = useMutation({
    mutationFn: async ({ studentId, status }: { studentId: string; status: "dropped" | "wrong_stop" }) => {
      if (!trip || !driver) return;
      const { error } = await supabase.from("qr_logs").insert({
        school_id: driver.school_id,
        driver_id: driver.id,
        trip_id: trip.id,
        student_id: studentId,
        event_type: status,
        scanned_at: new Date().toISOString(),
        location: null,
      });
      if (error) throw error;
    },
    onSuccess: () => { invalidateAttendance(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (!trip) return <EmptyState title="Trip not found" description="This trip may have been deleted or you don't have access." />;

  const nextStop = trip.stop_progress.find((s) => s.status !== "departed" && s.status !== "skipped");
  const remainingStops = trip.stop_progress.filter((s) => s.status !== "departed" && s.status !== "skipped").length;
  const completionSummary = (trip.metadata?.completion_summary ?? null) as CompletionStats | null;
  const isCompleted = trip.status === "completed";

  return (
    <div className="space-y-4">
      {isCompleted && <CompletedTripBanner summary={completionSummary} />}
      <PageHeader
        title={trip.name ?? trip.routes?.name ?? "Live trip"}
        description={`${tripTypeLabel(trip.trip_type)} · ${trip.trip_date} · ${trip.trip_code ?? ""}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" asChild><Link to="/driver/today"><ArrowLeft className="mr-2 h-4 w-4" /> Back</Link></Button>
            {isLive && (
              <Button variant="outline" asChild>
                <Link to="/driver/qr"><QrCode className="mr-2 h-4 w-4" /> Scan QR</Link>
              </Button>
            )}
            {isLive && <Button variant="outline" onClick={() => pause.mutate()}><Pause className="mr-2 h-4 w-4" /> Pause</Button>}
            {isPaused && <Button onClick={() => resume.mutate()}><Play className="mr-2 h-4 w-4" /> Resume</Button>}
            {(isLive || isPaused) && (
              <Button variant="destructive" onClick={() => setCompletionOpen(true)}>
                <Square className="mr-2 h-4 w-4" /> Complete trip
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
        <StatCard label="Progress" value={`${presentCount} / ${totalStudents}`} sub={`${remainingStops} stops · ${remainingStudents} pending`} icon={Users} />
      </div>

      <div className="grid gap-3 grid-cols-2 sm:grid-cols-5">
        <StatCard label="Total" value={String(totalStudents)} icon={Users} />
        <StatCard label={isDrop ? "Dropped" : "Boarded"} value={String(isDrop ? counts.dropped : counts.boarded)} icon={CheckCircle2} />
        <StatCard label="Late" value={String(counts.late)} icon={Clock} />
        <StatCard label="Absent" value={String(counts.absent)} icon={UserX} />
        <StatCard label="Remaining" value={String(remainingStudents)} />
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
          <StopList trip={trip} canManage={isLive} onArrive={(id) => markStop.mutate({ stopId: id, action: "arrive" })} onDepart={(id, b, m) => markStop.mutate({ stopId: id, action: "depart", boarded: b, missing: m })} onSkip={(id) => { if (confirm("Skip this stop? Remaining students may be auto-marked absent.")) markStop.mutate({ stopId: id, action: "skip" }); }} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4" /> Students on this trip</CardTitle>
        </CardHeader>
        <CardContent>
          {routeStudents.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">No students on this route.</div>
          ) : (
            <>
              {!isDrop && (
                <p className="mb-3 text-xs text-muted-foreground">
                  Boarded, Late and Absent update automatically from QR scans and stop progress. Use the QR Scanner to board students.
                </p>
              )}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead>Pickup</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Scanned</TableHead>
                    {isDrop && <TableHead className="w-[240px]">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {routeStudents.map((s) => {
                    const rec = attendance[s.id];
                    return (
                      <TableRow key={s.id}>
                        <TableCell>
                          <div className="font-medium">{s.full_name}</div>
                          <div className="text-xs text-muted-foreground">{s.student_code ?? "—"}</div>
                        </TableCell>
                        <TableCell>{[s.grade, s.class_section].filter(Boolean).join(" · ") || "—"}</TableCell>
                        <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">{s.pickup_address ?? "—"}</TableCell>
                        <TableCell><AttendanceBadge status={rec?.event_type ?? null} /></TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {rec?.scanned_at ? new Date(rec.scanned_at).toLocaleTimeString() : "—"}
                        </TableCell>
                        {isDrop && (
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              <Button size="sm" variant="outline" disabled={!isLive || rec?.event_type === "dropped"} onClick={() => studentStatus.mutate({ studentId: s.id, status: "dropped" })}>
                                Dropped
                              </Button>
                              <Button size="sm" variant="destructive" disabled={!isLive} onClick={() => studentStatus.mutate({ studentId: s.id, status: "wrong_stop" })}>
                                Wrong stop
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </>
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

function AttendanceBadge({ status }: { status: AttendanceEventType | null }) {
  if (!status) return <span className="text-xs text-muted-foreground">—</span>;
  const map: Record<AttendanceEventType, { label: string; className: string }> = {
    boarded: { label: "Boarded", className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
    late: { label: "Late", className: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400" },
    absent: { label: "Absent", className: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400" },
    dropped: { label: "Dropped", className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
    wrong_stop: { label: "Wrong stop", className: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400" },
  };
  const cfg = map[status];
  return <Badge variant="outline" className={cfg.className}>{cfg.label}</Badge>;
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
