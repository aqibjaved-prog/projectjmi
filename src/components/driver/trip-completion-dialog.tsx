import { useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  CheckCircle2, AlertTriangle, Clock, Users, MapPin, Route as RouteIcon,
  Gauge, Timer, Car, User, Calendar, Flag,
} from "lucide-react";
import { tripTypeLabel, type TripRow, type TripStopProgress } from "@/lib/trips";
import type { TripAttendance } from "@/hooks/use-trip-attendance";
import type { DriverTripRow } from "@/lib/driver-portal";

export interface CompletionStats {
  total_students: number;
  boarded: number;
  dropped: number;
  absent: number;
  late: number;
  remaining: number;
  scheduled_start: string | null;
  actual_start: string | null;
  actual_end: string;      // ISO — computed at open time
  duration_min: number | null;
  driving_min: number | null;
  waiting_min: number | null;
  stops_completed: number;
  stops_skipped: number;
  distance_km: number | null;
  avg_speed_kmh: number | null;
  route_name: string | null;
  driver_name: string | null;
  vehicle_registration: string | null;
  trip_type: string;
  trip_date: string;
  trip_name: string | null;
  completed_at: string;
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s1 = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s1));
}

function computeDistanceKm(stops: TripStopProgress[]): number | null {
  const pts = stops.map((s) => (s.lat != null && s.lng != null ? { lat: Number(s.lat), lng: Number(s.lng) } : null))
    .filter((p): p is { lat: number; lng: number } => !!p);
  if (pts.length < 2) return null;
  let km = 0;
  for (let i = 1; i < pts.length; i++) km += haversineKm(pts[i - 1], pts[i]);
  return Math.round(km * 10) / 10;
}

function minutesBetween(a?: string | null, b?: string | null): number | null {
  if (!a || !b) return null;
  const t1 = new Date(a).getTime();
  const t2 = new Date(b).getTime();
  if (!Number.isFinite(t1) || !Number.isFinite(t2)) return null;
  return Math.max(0, Math.round((t2 - t1) / 60000));
}

function fmtMin(m: number | null): string {
  if (m == null) return "—";
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return h > 0 ? `${h}h ${mm}m` : `${mm}m`;
}

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); } catch { return "—"; }
}

export function computeCompletionStats(
  trip: DriverTripRow,
  attendance: TripAttendance,
  routeStudentCount: number,
  driverName: string | null,
): CompletionStats {
  const stops = trip.stop_progress ?? [];
  const counts = attendance.counts;
  const totalStudents = routeStudentCount;
  const isDrop = trip.trip_type === "drop";
  const present = isDrop ? counts.dropped : counts.boarded + counts.late;
  const remaining = Math.max(0, totalStudents - present - counts.absent - counts.wrong_stop);

  const actualEnd = new Date().toISOString();
  const durationMin = minutesBetween(trip.started_at, actualEnd);

  // Waiting = sum of (departure - arrival) per stop.
  let waiting = 0;
  let waitingCount = 0;
  for (const s of stops) {
    const w = minutesBetween(s.actual_arrival, s.actual_departure);
    if (w != null) { waiting += w; waitingCount++; }
  }
  const drivingMin = durationMin != null ? Math.max(0, durationMin - waiting) : null;
  const distanceKm = computeDistanceKm(stops);
  const avgSpeed = distanceKm != null && drivingMin && drivingMin > 0
    ? Math.round((distanceKm / (drivingMin / 60)) * 10) / 10
    : null;

  return {
    total_students: totalStudents,
    boarded: counts.boarded,
    dropped: counts.dropped,
    absent: counts.absent,
    late: counts.late,
    remaining,
    scheduled_start: trip.expected_start_time,
    actual_start: trip.started_at,
    actual_end: actualEnd,
    duration_min: durationMin,
    driving_min: drivingMin,
    waiting_min: waitingCount > 0 ? waiting : null,
    stops_completed: stops.filter((s) => s.status === "departed").length,
    stops_skipped: stops.filter((s) => s.status === "skipped").length,
    distance_km: distanceKm,
    avg_speed_kmh: avgSpeed,
    route_name: trip.routes?.name ?? null,
    driver_name: driverName,
    vehicle_registration: trip.vehicles?.registration_number ?? null,
    trip_type: trip.trip_type,
    trip_date: trip.trip_date,
    trip_name: trip.name ?? trip.routes?.name ?? null,
    completed_at: actualEnd,
  };
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  trip: DriverTripRow;
  attendance: TripAttendance;
  routeStudentCount: number;
  driverName: string | null;
  onConfirm: (stats: CompletionStats) => void | Promise<void>;
  submitting?: boolean;
}

export function TripCompletionDialog({
  open, onOpenChange, trip, attendance, routeStudentCount, driverName, onConfirm, submitting,
}: Props) {
  // Recompute each time the dialog opens so end-time & durations are fresh.
  const stats = useMemo(
    () => computeCompletionStats(trip, attendance, routeStudentCount, driverName),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, trip, attendance, routeStudentCount, driverName],
  );
  const [confirmed, setConfirmed] = useState(false);
  const isDrop = trip.trip_type === "drop";
  const unresolved = stats.remaining;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!submitting) { setConfirmed(false); onOpenChange(v); } }}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto p-0">
        <div className="bg-gradient-to-br from-emerald-500/15 via-emerald-500/5 to-transparent p-6">
          <DialogHeader className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                <Flag className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-xl">Complete trip</DialogTitle>
                <DialogDescription className="mt-0.5">Review the summary before finishing.</DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        <div className="space-y-4 px-6 pb-6">
          {/* Trip info */}
          <Card>
            <CardContent className="grid gap-3 p-4 sm:grid-cols-2">
              <InfoRow icon={RouteIcon} label="Trip" value={stats.trip_name ?? "—"} />
              <InfoRow icon={Calendar} label="Date" value={`${stats.trip_date} · ${tripTypeLabel(stats.trip_type)}`} />
              <InfoRow icon={MapPin} label="Route" value={stats.route_name ?? "—"} />
              <InfoRow icon={User} label="Driver" value={stats.driver_name ?? "—"} />
              <InfoRow icon={Car} label="Vehicle" value={stats.vehicle_registration ?? "—"} />
              <InfoRow icon={Clock} label="Completed at" value={fmtTime(stats.actual_end)} />
            </CardContent>
          </Card>

          {/* Warning */}
          {unresolved > 0 && (
            <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <div className="font-semibold">Some students still have no final attendance status.</div>
                <div className="text-xs opacity-90">
                  {unresolved} student{unresolved === 1 ? "" : "s"} without a final status. Confirming now will auto-mark them as Absent.
                </div>
              </div>
            </div>
          )}

          {/* Attendance */}
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Attendance</div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <StatTile label="Assigned" value={stats.total_students} icon={Users} />
              {isDrop
                ? <StatTile label="Dropped" value={stats.dropped} tone="success" icon={CheckCircle2} />
                : <StatTile label="Boarded" value={stats.boarded} tone="success" icon={CheckCircle2} />}
              <StatTile label="Late" value={stats.late} tone="warning" icon={Clock} />
              <StatTile label="Absent" value={stats.absent} tone="destructive" />
              <StatTile label="Remaining" value={stats.remaining} tone={stats.remaining > 0 ? "warning" : "muted"} />
            </div>
          </div>

          {/* Trip statistics */}
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Trip statistics</div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <StatTile label="Scheduled start" value={stats.scheduled_start ?? "—"} />
              <StatTile label="Actual start" value={fmtTime(stats.actual_start)} />
              <StatTile label="End time" value={fmtTime(stats.actual_end)} />
              <StatTile label="Duration" value={fmtMin(stats.duration_min)} icon={Timer} />
              <StatTile label="Driving" value={fmtMin(stats.driving_min)} />
              <StatTile label="Waiting" value={fmtMin(stats.waiting_min)} />
              <StatTile label="Stops done" value={stats.stops_completed} />
              <StatTile label="Skipped" value={stats.stops_skipped} tone={stats.stops_skipped > 0 ? "warning" : "muted"} />
              <StatTile label="Distance" value={stats.distance_km != null ? `${stats.distance_km} km` : "—"} icon={MapPin} />
              <StatTile label="Avg speed" value={stats.avg_speed_kmh != null ? `${stats.avg_speed_kmh} km/h` : "—"} icon={Gauge} />
            </div>
          </div>

          {unresolved > 0 && (
            <label className="flex items-start gap-2 rounded-md border p-3 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              <span>I understand {unresolved} unresolved student{unresolved === 1 ? " will be" : "s will be"} auto-marked absent.</span>
            </label>
          )}
        </div>

        <DialogFooter className="gap-2 border-t bg-muted/30 p-4 sm:justify-between">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Back to trip
          </Button>
          <Button
            size="lg"
            className="bg-emerald-600 hover:bg-emerald-700"
            disabled={submitting || (unresolved > 0 && !confirmed)}
            onClick={() => void onConfirm(stats)}
          >
            <CheckCircle2 className="mr-2 h-5 w-5" />
            {submitting ? "Completing…" : "Complete trip"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-muted"><Icon className="h-4 w-4" /></div>
      <div className="min-w-0">
        <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="truncate text-sm font-medium">{value}</div>
      </div>
    </div>
  );
}

function StatTile({
  label, value, icon: Icon, tone = "default",
}: { label: string; value: string | number; icon?: any; tone?: "default" | "success" | "warning" | "destructive" | "muted" }) {
  const toneCls: Record<string, string> = {
    default: "border-border",
    success: "border-emerald-500/40 bg-emerald-500/5",
    warning: "border-amber-500/40 bg-amber-500/5",
    destructive: "border-red-500/40 bg-red-500/5",
    muted: "border-border bg-muted/40",
  };
  return (
    <div className={`rounded-md border p-3 ${toneCls[tone]}`}>
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </div>
      <div className="mt-1 truncate text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

export function CompletedTripBanner({ summary }: { summary: CompletionStats | null | undefined }) {
  if (!summary) return null;
  return (
    <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <Badge className="bg-emerald-600 hover:bg-emerald-600"><CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Trip completed</Badge>
        <span className="text-sm text-muted-foreground">
          {fmtTime(summary.completed_at)} · {fmtMin(summary.duration_min)}
          {summary.distance_km != null && ` · ${summary.distance_km} km`}
          {" · "}{(summary.trip_type === "drop" ? summary.dropped : summary.boarded)} present · {summary.absent} absent
        </span>
      </div>
    </div>
  );
}
