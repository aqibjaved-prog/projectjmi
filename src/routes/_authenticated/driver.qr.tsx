import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Camera, CameraOff, QrCode, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import { supabase } from "@/integrations/supabase/client";
import { useMyDriver, useDriverTrips } from "@/lib/driver-portal";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/driver/qr")({
  head: () => ({ meta: [{ title: "QR Scanner" }] }),
  component: QrPage,
});

type FeedbackKind = "success" | "warning" | "error" | "info";
interface Feedback {
  kind: FeedbackKind;
  title: string;
  detail?: string;
  studentName?: string;
  studentCode?: string | null;
  at: string;
}

interface HistoryItem extends Feedback {
  id: string;
}

const COOLDOWN_MS = 2000;

function beep(ok: boolean) {
  try {
    const Ctor = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = "sine";
    o.frequency.value = ok ? 880 : 220;
    g.gain.value = 0.15;
    o.start();
    setTimeout(() => { o.stop(); ctx.close().catch(() => {}); }, ok ? 160 : 320);
  } catch { /* no-op */ }
}

function vibrate(ok: boolean) {
  try { navigator.vibrate?.(ok ? 80 : [80, 60, 80]); } catch { /* no-op */ }
}

async function getPosition(): Promise<GeolocationPosition | null> {
  if (!("geolocation" in navigator)) return null;
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve(p),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 4000, maximumAge: 15_000 },
    );
  });
}

function QrPage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const lockRef = useRef<{ value: string; at: number } | null>(null);
  const processingRef = useRef(false);

  const [active, setActive] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [validating, setValidating] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  const { data: driver } = useMyDriver();
  const { data: trips } = useDriverTrips();

  const activeTrip = trips?.find((t) => t.status === "in_progress" || t.status === "paused") ?? null;

  const pushHistory = useCallback((f: Feedback) => {
    setFeedback(f);
    setHistory((prev) => [{ ...f, id: crypto.randomUUID() }, ...prev].slice(0, 25));
    setTimeout(() => setFeedback((cur) => (cur === f ? null : cur)), 2500);
  }, []);

  const handleDecoded = useCallback(async (raw: string) => {
    if (processingRef.current) return;
    const now = Date.now();
    if (lockRef.current && lockRef.current.value === raw && now - lockRef.current.at < COOLDOWN_MS) return;
    lockRef.current = { value: raw, at: now };
    processingRef.current = true;
    setValidating(true);

    try {
      if (!driver) {
        pushHistory({ kind: "error", title: "Driver profile not loaded", at: new Date().toISOString() });
        return;
      }
      if (!activeTrip) {
        pushHistory({ kind: "error", title: "No Active Trip", detail: "Start a trip before scanning.", at: new Date().toISOString() });
        beep(false); vibrate(false);
        return;
      }

      const trimmed = raw.trim();
      if (!trimmed) {
        pushHistory({ kind: "error", title: "Invalid QR Code", at: new Date().toISOString() });
        beep(false); vibrate(false);
        return;
      }

      // Look up student — RLS ensures cross-school queries return nothing.
      const { data: student, error: sErr } = await supabase
        .from("students")
        .select("id, full_name, student_code, school_id, route_id, is_active, qr_code")
        .eq("qr_code", trimmed)
        .maybeSingle();

      if (sErr) throw sErr;
      if (!student) {
        pushHistory({ kind: "error", title: "Student Not Found", detail: "This QR does not match any student.", at: new Date().toISOString() });
        beep(false); vibrate(false);
        return;
      }
      if (student.school_id !== driver.school_id || !student.is_active) {
        pushHistory({ kind: "error", title: "Student Not Found", at: new Date().toISOString() });
        beep(false); vibrate(false);
        return;
      }
      if (activeTrip.route_id && student.route_id && student.route_id !== activeTrip.route_id) {
        pushHistory({
          kind: "error",
          title: "Student Not Assigned to This Trip",
          detail: "Student belongs to a different route.",
          studentName: student.full_name,
          studentCode: student.student_code,
          at: new Date().toISOString(),
        });
        beep(false); vibrate(false);
        return;
      }

      // Duplicate check: already boarded / late on this trip?
      const { data: dup, error: dErr } = await supabase
        .from("qr_logs")
        .select("id, event_type")
        .eq("trip_id", activeTrip.id)
        .eq("student_id", student.id)
        .in("event_type", ["boarded", "late"])
        .limit(1);
      if (dErr) throw dErr;
      if (dup && dup.length > 0) {
        pushHistory({
          kind: "warning",
          title: "Already Boarded",
          detail: "This student has already been scanned for this trip.",
          studentName: student.full_name,
          studentCode: student.student_code,
          at: new Date().toISOString(),
        });
        beep(false); vibrate(false);
        return;
      }

      // Late detection: scanned_at > expected_start + grace period.
      // Grace period defaults to 10 minutes; configurable per trip via
      // trip.metadata.late_grace_min.
      const now = new Date();
      const graceMin = Number(((activeTrip.metadata ?? {}) as any).late_grace_min ?? 10);
      let isLate = false;
      if (activeTrip.expected_start_time && activeTrip.trip_date) {
        const [hh, mm, ss] = activeTrip.expected_start_time.split(":").map((n) => Number(n) || 0);
        const scheduled = new Date(`${activeTrip.trip_date}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss || 0).padStart(2, "0")}`);
        if (!Number.isNaN(scheduled.getTime())) {
          const deadline = new Date(scheduled.getTime() + graceMin * 60_000);
          isLate = now.getTime() > deadline.getTime();
        }
      }
      const eventType = isLate ? "late" : "boarded";

      // GPS (best effort)
      const pos = await getPosition();
      const location = pos
        ? { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }
        : null;

      const { error: iErr } = await supabase.from("qr_logs").insert({
        school_id: driver.school_id,
        driver_id: driver.id,
        trip_id: activeTrip.id,
        student_id: student.id,
        event_type: eventType,
        location,
        scanned_at: now.toISOString(),
      });
      if (iErr) throw iErr;

      pushHistory({
        kind: isLate ? "warning" : "success",
        title: isLate ? "Boarded (Late)" : "Boarded",
        detail: isLate ? `Scanned after ${graceMin}-minute grace period.` : undefined,
        studentName: student.full_name,
        studentCode: student.student_code,
        at: new Date().toISOString(),
      });
      beep(true); vibrate(true);
    } catch (e) {
      pushHistory({
        kind: "error",
        title: "Scan failed",
        detail: e instanceof Error ? e.message : "Unexpected error",
        at: new Date().toISOString(),
      });
      beep(false); vibrate(false);
    } finally {
      setValidating(false);
      // Resume after cooldown
      setTimeout(() => { processingRef.current = false; }, COOLDOWN_MS);
    }
  }, [driver, activeTrip, pushHistory]);

  const start = useCallback(async () => {
    setErr(null);
    try {
      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]);
      hints.set(DecodeHintType.TRY_HARDER, true);
      const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 150 });
      readerRef.current = reader;

      const video = videoRef.current;
      if (!video) return;

      const controls = await reader.decodeFromVideoDevice(undefined, video, (result) => {
        if (result) {
          void handleDecoded(result.getText());
        }
      });
      controlsRef.current = controls;
      setActive(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unable to access camera";
      setErr(msg.includes("Permission") ? "Camera permission denied. Enable it in your browser settings." : msg);
    }
  }, [handleDecoded]);

  const stop = useCallback(() => {
    try { controlsRef.current?.stop(); } catch { /* no-op */ }
    controlsRef.current = null;
    readerRef.current = null;
    setActive(false);
    processingRef.current = false;
    lockRef.current = null;
  }, []);

  useEffect(() => () => stop(), [stop]);

  const canScan = !!driver && !!activeTrip;

  return (
    <div className="space-y-4">
      <PageHeader title="QR Scanner" description="Scan student QR codes to mark boarding for the active trip." />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <QrCode className="h-4 w-4" />
            <CardTitle className="text-base">Camera</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {activeTrip ? (
              <Badge variant="secondary">Trip {activeTrip.trip_code ?? activeTrip.name ?? ""}</Badge>
            ) : (
              <Badge variant="outline">No Active Trip</Badge>
            )}
            {active ? (
              <Button variant="outline" size="sm" onClick={stop}><CameraOff className="mr-2 h-4 w-4" /> Stop</Button>
            ) : (
              <Button size="sm" onClick={start} disabled={!canScan}><Camera className="mr-2 h-4 w-4" /> Open camera</Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {err && <div className="mb-3 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{err}</div>}
          {!activeTrip && (
            <div className="mb-3 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
              Start a trip from "Today's Trip" before scanning students.
            </div>
          )}
          <div className="relative overflow-hidden rounded-md border bg-black">
            <video ref={videoRef} className="h-[360px] w-full object-cover" playsInline muted autoPlay />
            {!active && (
              <div className="absolute inset-0 grid place-items-center text-sm text-white/60">Camera preview appears here.</div>
            )}
            {active && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="h-56 w-56 rounded-lg border-2 border-white/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
              </div>
            )}
            {validating && (
              <div className="absolute inset-0 grid place-items-center bg-black/40 text-white">
                <div className="flex items-center gap-2 rounded-md bg-black/60 px-4 py-2 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" /> Validating…
                </div>
              </div>
            )}
            {feedback && (
              <FeedbackOverlay feedback={feedback} />
            )}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Scanning is continuous. QR codes are decoded automatically. Duplicate scans within {Math.round(COOLDOWN_MS / 1000)}s are ignored.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Scan history</CardTitle>
          {history.length > 0 && <Button size="sm" variant="ghost" onClick={() => setHistory([])}>Clear</Button>}
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">No scans yet.</div>
          ) : (
            <ul className="space-y-2">
              {history.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
                  <div className="flex items-center gap-2">
                    {r.kind === "success" ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className={cn("h-4 w-4", r.kind === "warning" ? "text-amber-600" : "text-destructive")} />}
                    <div>
                      <div className="font-medium">
                        {r.title}
                        {r.studentName && <span className="ml-1 text-muted-foreground">— {r.studentName}{r.studentCode ? ` (${r.studentCode})` : ""}</span>}
                      </div>
                      {r.detail && <div className="text-xs text-muted-foreground">{r.detail}</div>}
                    </div>
                  </div>
                  <Badge variant="outline">{new Date(r.at).toLocaleTimeString()}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function FeedbackOverlay({ feedback }: { feedback: Feedback }) {
  const isOk = feedback.kind === "success";
  const isWarn = feedback.kind === "warning";
  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center">
      <div
        className={cn(
          "animate-in fade-in zoom-in-95 flex flex-col items-center gap-2 rounded-2xl px-6 py-5 text-center text-white shadow-2xl",
          isOk ? "bg-emerald-600/90" : isWarn ? "bg-amber-600/90" : "bg-red-600/90",
        )}
      >
        {isOk ? <CheckCircle2 className="h-10 w-10" /> : <XCircle className="h-10 w-10" />}
        <div className="text-lg font-semibold">{feedback.title}</div>
        {feedback.studentName && (
          <div className="text-sm opacity-90">
            {feedback.studentName}{feedback.studentCode ? ` · ${feedback.studentCode}` : ""}
          </div>
        )}
        {feedback.detail && <div className="text-xs opacity-90">{feedback.detail}</div>}
      </div>
    </div>
  );
}
