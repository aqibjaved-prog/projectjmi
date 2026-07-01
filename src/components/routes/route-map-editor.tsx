import { useEffect, useRef, useState } from "react";
import { isGoogleMapsConfigured, loadGoogleMaps } from "@/lib/google-maps-loader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  AlertCircle, AlertTriangle, Loader2, MapPin, Navigation, Trash2, Plus,
  GripVertical, Clock, Route as RouteIcon, RotateCcw,
} from "lucide-react";
import type { RouteStop } from "@/lib/routes";
import {
  calculateStopTimetable,
  clearStopTimetable,
  DEFAULT_DWELL_MIN,
  effectiveDwellMinutes,
  fmtHHMM,
  newStop,
  parseHHMM,
  travelSecondsToScheduleMinutes,
  WAITING_FOR_GOOGLE_ROUTE,
} from "@/lib/routes";
import { computeDirections, reverseGeocode as reverseGeocodeFn } from "@/lib/maps.functions";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, arrayMove, useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export interface RoutePoint {
  address: string;
  lat: number | null;
  lng: number | null;
}

interface Props {
  start: RoutePoint;
  end: RoutePoint;
  stops: RouteStop[];
  color?: string;
  maxStops?: number | null;
  startTime?: string | null;      // "HH:MM"
  defaultDwellMin?: number | null;
  onStartChange: (p: RoutePoint) => void;
  onEndChange: (p: RoutePoint) => void;
  onStopsChange: (stops: RouteStop[]) => void;
  onSummaryChange?: (s: { distanceKm: number | null; durationMin: number | null }) => void;
  onEndLegChange?: (info: { seconds: number | null; meters: number | null }) => void;
}

const DEFAULT_CENTER = { lat: 20.5937, lng: 78.9629 };

export function RouteMapEditor(props: Props) {
  if (!isGoogleMapsConfigured()) return <MissingKeyPlaceholder />;
  return <MapEditor {...props} />;
}

function MissingKeyPlaceholder() {
  return (
    <Card className="border-dashed p-6">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 text-amber-600" />
        <div className="space-y-1 text-sm">
          <div className="font-medium">Google Maps is not configured</div>
          <p className="text-muted-foreground">
            Connect the Google Maps Platform integration to enable address search, the
            interactive route map, and automatic distance/duration calculation.
          </p>
        </div>
      </div>
    </Card>
  );
}

interface LegInfo { seconds: number; meters: number }

const stopsEqual = (a: RouteStop[], b: RouteStop[]) => JSON.stringify(a) === JSON.stringify(b);
const hasGoogleDuration = (seconds: number | null | undefined) =>
  seconds != null && Number.isFinite(Number(seconds));

function MapEditor({
  start, end, stops, color = "#3b82f6", maxStops,
  startTime, defaultDwellMin,
  onStartChange, onEndChange, onStopsChange, onSummaryChange, onEndLegChange,
}: Props) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const startMarkerRef = useRef<google.maps.Marker | null>(null);
  const endMarkerRef = useRef<google.maps.Marker | null>(null);
  const stopMarkersRef = useRef<google.maps.Marker[]>([]);
  const polylineRef = useRef<google.maps.Polyline | null>(null);
  const clickListenerRef = useRef<google.maps.MapsEventListener | null>(null);
  const geocodeCacheRef = useRef<Map<string, string>>(new Map());
  const directionsReqRef = useRef(0);
  const lastPosSigRef = useRef<string>("");

  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [computing, setComputing] = useState(false);
  const [summary, setSummary] = useState<{ distanceKm: number | null; durationMin: number | null }>({
    distanceKm: null, durationMin: null,
  });
  const [endLeg, setEndLeg] = useState<LegInfo | null>(null);
  const [directionsError, setDirectionsError] = useState(false);

  const dwellDefault = (() => {
    const n = Number(defaultDwellMin);
    return Number.isFinite(n) && n >= 0 ? n : DEFAULT_DWELL_MIN;
  })();

  const latest = useRef({ start, end, stops, onStartChange, onEndChange, onStopsChange });
  useEffect(() => {
    latest.current = { start, end, stops, onStartChange, onEndChange, onStopsChange };
  });

  const clearRouteTimetable = (nextStops = latest.current.stops) =>
    clearStopTimetable(nextStops, { clearLegs: true, resetManualTimes: true }).map((s, i) => ({ ...s, order: i }));

  const handleStartChange = (p: RoutePoint) => {
    onStartChange(p);
    if (latest.current.stops.length > 0) onStopsChange(clearRouteTimetable());
  };

  const handleEndChange = (p: RoutePoint) => {
    onEndChange(p);
    if (latest.current.stops.length > 0) onStopsChange(clearRouteTimetable());
  };

  // Load Maps + init
  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps(["places", "geometry"])
      .then((g) => {
        if (cancelled || !mapContainerRef.current) return;
        const map = new g.maps.Map(mapContainerRef.current, {
          center: DEFAULT_CENTER, zoom: 5,
          mapTypeControl: false, streetViewControl: false, fullscreenControl: false,
        });
        mapRef.current = map;
        polylineRef.current = new g.maps.Polyline({
          map, path: [], strokeColor: color, strokeWeight: 5, strokeOpacity: 0.85,
        });
        clickListenerRef.current = map.addListener("click", (e: google.maps.MapMouseEvent) => {
          if (!e.latLng) return;
          void handleMapClick(e.latLng.lat(), e.latLng.lng());
        });
        setReady(true);
      })
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : "Failed to load map"));
    return () => {
      cancelled = true;
      clickListenerRef.current?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    polylineRef.current?.setOptions({ strokeColor: color });
  }, [color]);

  const handleMapClick = async (lat: number, lng: number) => {
    const { start: s, end: e, stops: st, onStartChange: oS, onEndChange: oE, onStopsChange: oSt } = latest.current;
    const address = await reverseLookup(lat, lng);
    if (s.lat == null) { oS({ address, lat, lng }); if (st.length > 0) oSt(clearRouteTimetable(st)); return; }
    if (e.lat == null) { oE({ address, lat, lng }); if (st.length > 0) oSt(clearRouteTimetable(st)); return; }
    const stop = { ...newStop(st.length), name: address || `Stop ${st.length + 1}`, address, lat, lng };
    oSt(clearRouteTimetable([...st, stop]));
  };

  const reverseLookup = async (lat: number, lng: number): Promise<string> => {
    const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
    const cached = geocodeCacheRef.current.get(key);
    if (cached !== undefined) return cached;
    try {
      const { address } = await reverseGeocodeFn({ data: { lat, lng } });
      geocodeCacheRef.current.set(key, address);
      return address;
    } catch { return ""; }
  };

  // Position signature — only run Directions when positions change
  const posSig = JSON.stringify({
    s: [start.lat, start.lng], e: [end.lat, end.lng],
    w: stops.map((s) => [s.lat, s.lng]),
  });

  // Sync markers + directions (position-only deps)
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const g = (window as unknown as { google: typeof google }).google;
    const map = mapRef.current;

    // Start marker
    if (start.lat != null && start.lng != null) {
      if (!startMarkerRef.current) {
        startMarkerRef.current = new g.maps.Marker({
          map, draggable: true, label: { text: "A", color: "#fff", fontWeight: "bold" },
        });
        startMarkerRef.current.addListener("dragend", async (e: google.maps.MapMouseEvent) => {
          if (!e.latLng) return;
          const lat = e.latLng.lat(), lng = e.latLng.lng();
          const address = await reverseLookup(lat, lng);
          latest.current.onStartChange({ address, lat, lng });
        });
      }
      startMarkerRef.current.setPosition({ lat: start.lat, lng: start.lng });
    } else {
      startMarkerRef.current?.setMap(null); startMarkerRef.current = null;
    }

    // End marker
    if (end.lat != null && end.lng != null) {
      if (!endMarkerRef.current) {
        endMarkerRef.current = new g.maps.Marker({
          map, draggable: true, label: { text: "B", color: "#fff", fontWeight: "bold" },
        });
        endMarkerRef.current.addListener("dragend", async (e: google.maps.MapMouseEvent) => {
          if (!e.latLng) return;
          const lat = e.latLng.lat(), lng = e.latLng.lng();
          const address = await reverseLookup(lat, lng);
          latest.current.onEndChange({ address, lat, lng });
        });
      }
      endMarkerRef.current.setPosition({ lat: end.lat, lng: end.lng });
    } else {
      endMarkerRef.current?.setMap(null); endMarkerRef.current = null;
    }

    // Stop markers
    stopMarkersRef.current.forEach((m) => m.setMap(null));
    stopMarkersRef.current = [];
    stops.forEach((s, i) => {
      if (s.lat == null || s.lng == null) return;
      const marker = new g.maps.Marker({
        map, position: { lat: s.lat, lng: s.lng }, draggable: true,
        label: { text: String(i + 1), color: "#fff", fontWeight: "bold" },
      });
      marker.addListener("dragend", async (e: google.maps.MapMouseEvent) => {
        if (!e.latLng) return;
        const lat = e.latLng.lat(), lng = e.latLng.lng();
        const address = await reverseLookup(lat, lng);
        const next = latest.current.stops.map((x, idx) =>
          idx === i ? { ...x, lat, lng, address } : x);
        latest.current.onStopsChange(next);
      });
      stopMarkersRef.current.push(marker);
    });

    // Fit bounds
    const bounds = new g.maps.LatLngBounds();
    let has = false;
    if (start.lat != null && start.lng != null) { bounds.extend({ lat: start.lat, lng: start.lng }); has = true; }
    if (end.lat != null && end.lng != null) { bounds.extend({ lat: end.lat, lng: end.lng }); has = true; }
    stops.forEach((s) => { if (s.lat != null && s.lng != null) { bounds.extend({ lat: s.lat, lng: s.lng }); has = true; } });
    if (has) map.fitBounds(bounds, 60);

    // Only call Google when positions have actually changed
    if (lastPosSigRef.current !== posSig) {
      lastPosSigRef.current = posSig;
      void runDirections();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, posSig]);

  const runDirections = async () => {
    const poly = polylineRef.current;
    if (!poly) return;
    const curStops = latest.current.stops;
    const hasIncompletePoint = curStops.some((s) => s.lat == null || s.lng == null);
    if (start.lat == null || start.lng == null || end.lat == null || end.lng == null || hasIncompletePoint) {
      poly.setPath([]);
      setSummary({ distanceKm: null, durationMin: null });
      setEndLeg(null);
      setDirectionsError(hasIncompletePoint || curStops.length > 0);
      onSummaryChange?.({ distanceKm: null, durationMin: null });
      onEndLegChange?.({ seconds: null, meters: null });
      const cleared = clearRouteTimetable(curStops);
      if (!stopsEqual(cleared, curStops)) latest.current.onStopsChange(cleared);
      return;
    }
    const waypoints = curStops
      .map((s) => ({ lat: s.lat as number, lng: s.lng as number }));
    const reqId = ++directionsReqRef.current;
    setComputing(true);
    setDirectionsError(false);
    try {
      const res = await computeDirections({
        data: {
          origin: { lat: start.lat, lng: start.lng },
          destination: { lat: end.lat, lng: end.lng },
          waypoints,
        },
      });
      if (reqId !== directionsReqRef.current) return;
      const g = (window as unknown as { google: typeof google }).google;
      if (res.encodedPolyline && g?.maps?.geometry?.encoding) {
        const path = g.maps.geometry.encoding.decodePath(res.encodedPolyline);
        poly.setPath(path);
      } else {
        poly.setPath([]);
      }
      const s = {
        distanceKm: +(res.distanceMeters / 1000).toFixed(2),
        durationMin: res.durationSeconds == null ? null : Math.round(res.durationSeconds / 60),
      };
      setSummary(s);
      onSummaryChange?.(s);

      // Legs: [start→stop1, stop1→stop2, ..., lastStop→end]
      // For N stops, legs length = N + 1. Last one is end leg.
      const legs = res.legs ?? [];
      const cur = latest.current.stops;
      const hasMissingStopLeg = cur.some((_, i) => !hasGoogleDuration(legs[i]?.durationSeconds));
      const hasMissingEndLeg = !hasGoogleDuration(legs[cur.length]?.durationSeconds);
      if (legs.length < cur.length + 1 || hasMissingStopLeg || hasMissingEndLeg) {
        setDirectionsError(true);
        setEndLeg(null);
        onEndLegChange?.({ seconds: null, meters: null });
        const cleared = clearRouteTimetable(cur);
        if (!stopsEqual(cleared, cur)) latest.current.onStopsChange(cleared);
        return;
      }
      const patched = cur.map((st, i) => {
        const leg = legs[i];
        if (!leg || !hasGoogleDuration(leg.durationSeconds)) return st;
        return {
          ...st,
          driving_seconds_from_prev: leg.durationSeconds as number,
          distance_from_prev_m: leg.distanceMeters,
        };
      });
      const endLegInfo = legs[cur.length]
        ? { seconds: legs[cur.length].durationSeconds as number, meters: legs[cur.length].distanceMeters }
        : { seconds: null, meters: null };
      setEndLeg(endLegInfo.seconds != null
        ? { seconds: endLegInfo.seconds, meters: endLegInfo.meters as number }
        : null);
      onEndLegChange?.(endLegInfo);
      if (!stopsEqual(patched, cur)) {
        latest.current.onStopsChange(patched);
      }
    } catch {
      poly.setPath([]);
      setDirectionsError(true);
      setSummary({ distanceKm: null, durationMin: null });
      setEndLeg(null);
      onSummaryChange?.({ distanceKm: null, durationMin: null });
      onEndLegChange?.({ seconds: null, meters: null });
      const cleared = clearRouteTimetable(latest.current.stops);
      if (!stopsEqual(cleared, latest.current.stops)) latest.current.onStopsChange(cleared);
    } finally {
      if (reqId === directionsReqRef.current) setComputing(false);
    }
  };

  // Recompute the whole timetable from the master start time whenever Google leg data,
  // start time, stop order, or dwell changes. If any Google leg is unavailable, clear
  // all stop times instead of carrying stale values forward.
  useEffect(() => {
    const result = calculateStopTimetable(stops, startTime, dwellDefault, { resetManualTimes: true });
    if (!stopsEqual(result.stops, stops)) latest.current.onStopsChange(result.stops);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startTime, dwellDefault, stops.map((s) => `${s.id}:${s.driving_seconds_from_prev}:${s.dwell_min}`).join("|")]);

  const removeStop = (i: number) => onStopsChange(clearRouteTimetable(stops.filter((_, idx) => idx !== i)));
  const updateStop = (i: number, patch: Partial<RouteStop>) => {
    const locationChanged = "lat" in patch || "lng" in patch || "address" in patch;
    const next = stops.map((s, idx) => (idx === i ? { ...s, ...patch } : s));
    onStopsChange(locationChanged ? clearRouteTimetable(next) : next);
  };

  const rebuildRoute = () => {
    const cleared = clearRouteTimetable(stops);
    if (!stopsEqual(cleared, stops)) onStopsChange(cleared);
    lastPosSigRef.current = "";
    void runDirections();
  };

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = stops.findIndex((s) => s.id === active.id);
    const newIndex = stops.findIndex((s) => s.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    // Reordering invalidates leg data — clear it so directions recompute
    onStopsChange(
      arrayMove(stops, oldIndex, newIndex).map((s, i) => ({
        ...s, order: i,
        arrival_time: "",
        departure_time: "",
        manual_time: false,
        driving_seconds_from_prev: null,
        distance_from_prev_m: null,
      })),
    );
  };

  // Summary aggregates
  const startMin = parseHHMM(startTime);
  const totalDwellMin = stops.reduce(
    (acc, s) => acc + effectiveDwellMinutes(s, dwellDefault),
    0,
  );
  const drivingMin = summary.durationMin ?? null;
  const endLegMin = endLeg ? Math.round(endLeg.seconds / 60) : null;
  const timetable = calculateStopTimetable(stops, startTime, dwellDefault, { resetManualTimes: true });
  const hasPendingStopLegs = stops.length > 0 && stops.some((s) => !hasGoogleDuration(s.driving_seconds_from_prev));
  const waitingForGoogleRoute = computing || directionsError || hasPendingStopLegs;
  const totalRouteMin = drivingMin == null ? null : drivingMin + totalDwellMin;
  const firstPickup = stops[0]?.arrival_time ?? "";
  const lastDrop = (() => {
    if (timetable.lastDepartureMinutes == null || endLeg == null) return "";
    const endTravel = travelSecondsToScheduleMinutes(endLeg.seconds);
    return endTravel == null ? "" : fmtHHMM(timetable.lastDepartureMinutes + endTravel);
  })();

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <Label className="text-xs">Starting point</Label>
          <PlaceInput
            value={start.address}
            onPlace={handleStartChange}
            onClear={() => handleStartChange({ address: "", lat: null, lng: null })}
            placeholder="Search starting location…"
          />
        </div>
        <div>
          <Label className="text-xs">Ending point</Label>
          <PlaceInput
            value={end.address}
            onPlace={handleEndChange}
            onClear={() => handleEndChange({ address: "", lat: null, lng: null })}
            placeholder="Search ending location…"
          />
        </div>
      </div>

      <div className="relative overflow-hidden rounded-lg border">
        {loadError && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/95 p-4 text-center text-sm text-muted-foreground">
            {loadError}
          </div>
        )}
        {!ready && !loadError && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/70">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
        <div ref={mapContainerRef} className="h-[380px] w-full" />
      </div>

      {/* Live route summary */}
      <div className="grid gap-2 rounded-lg border bg-muted/30 p-3 sm:grid-cols-3 lg:grid-cols-6">
        <SummaryCell label="Distance" value={summary.distanceKm != null ? `${summary.distanceKm} km` : "—"} icon={<RouteIcon className="h-3.5 w-3.5" />} />
        <SummaryCell label="Driving time" value={drivingMin != null ? `${drivingMin} min` : "—"} icon={<Navigation className="h-3.5 w-3.5" />} />
        <SummaryCell label="Total stop time" value={`${totalDwellMin} min`} icon={<Clock className="h-3.5 w-3.5" />} />
        <SummaryCell label="Total route time" value={totalRouteMin != null ? `${totalRouteMin} min` : "—"} icon={<Clock className="h-3.5 w-3.5" />} />
        <SummaryCell label="First pickup" value={firstPickup || "—"} icon={<MapPin className="h-3.5 w-3.5" />} />
        <SummaryCell label="Last drop" value={lastDrop || "—"} icon={<MapPin className="h-3.5 w-3.5" />} />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant="secondary" className="gap-1">
          <MapPin className="h-3 w-3" /> {stops.length} stop{stops.length === 1 ? "" : "s"}
        </Badge>
        {waitingForGoogleRoute && (
          <Badge variant="outline" className="gap-1">
            {computing ? <Loader2 className="h-3 w-3 animate-spin" /> : <AlertCircle className="h-3 w-3" />} {WAITING_FOR_GOOGLE_ROUTE}
          </Badge>
        )}
        {summary.distanceKm != null && summary.distanceKm > 50 && (
          <Badge variant="destructive" className="gap-1">
            <AlertTriangle className="h-3 w-3" /> Long route (&gt; 50 km)
          </Badge>
        )}
        {totalRouteMin != null && totalRouteMin > 90 && (
          <Badge variant="destructive" className="gap-1">
            <AlertTriangle className="h-3 w-3" /> Long duration (&gt; 90 min)
          </Badge>
        )}
        {typeof maxStops === "number" && maxStops > 0 && stops.length > maxStops && (
          <Badge variant="destructive" className="gap-1">
            <AlertTriangle className="h-3 w-3" /> Exceeds max stops ({maxStops})
          </Badge>
        )}
        {startMin == null && (
          <Badge variant="outline" className="gap-1">
            <AlertCircle className="h-3 w-3" /> Set a route start time to auto-fill arrivals
          </Badge>
        )}
        {endLegMin != null && (
          <span className="ml-auto text-xs text-muted-foreground">
            Last leg → destination: {endLegMin} min · {endLeg ? +(endLeg.meters / 1000).toFixed(2) : 0} km
          </span>
        )}
      </div>

      {/* Stops */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <Label className="text-sm font-medium">Stops</Label>
          <Button
            type="button" size="sm" variant="outline"
            onClick={() => onStopsChange(clearRouteTimetable([...stops, newStop(stops.length)]))}
          >
            <Plus className="mr-1 h-4 w-4" /> Add stop
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={rebuildRoute}>
            <RotateCcw className="mr-1 h-4 w-4" /> Recalculate Route
          </Button>
        </div>
        {stops.length === 0 ? (
          <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            No stops yet. Search a location below or click the map to add one.
          </p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={stops.map((s) => s.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {stops.map((s, i) => (
                  <SortableStopRow
                    key={s.id}
                    id={s.id}
                    index={i}
                    stop={s}
                    defaultDwell={dwellDefault}
                    onChange={(patch) => updateStop(i, patch)}
                    onRemove={() => removeStop(i)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
}

function SummaryCell({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        {icon} {label}
      </span>
      <span className="text-sm font-semibold">{value}</span>
    </div>
  );
}

function SortableStopRow({
  id, index, stop, defaultDwell, onChange, onRemove,
}: {
  id: string;
  index: number;
  stop: RouteStop;
  defaultDwell: number;
  onChange: (patch: Partial<RouteStop>) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 };
  const driveMin = stop.driving_seconds_from_prev != null
    ? Math.round(stop.driving_seconds_from_prev / 60) : null;
  const distKm = stop.distance_from_prev_m != null
    ? +(stop.distance_from_prev_m / 1000).toFixed(2) : null;
  const dwellEffective = stop.dwell_min == null ? defaultDwell : Number(stop.dwell_min);
  return (
    <Card ref={setNodeRef} style={style} className="p-3">
      <div className="flex items-start gap-2">
        <button type="button" className="mt-2 cursor-grab text-muted-foreground touch-none" {...attributes} {...listeners}>
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="grid flex-1 gap-2 md:grid-cols-12">
          <div className="md:col-span-1">
            <Label className="text-xs">#</Label>
            <div className="mt-1 flex h-9 items-center justify-center rounded-md border bg-muted/40 px-3 text-sm font-medium">
              {index + 1}
            </div>
          </div>
          <div className="md:col-span-3">
            <Label className="text-xs">Stop name *</Label>
            <Input value={stop.name} onChange={(e) => onChange({ name: e.target.value })} />
          </div>
          <div className="md:col-span-4">
            <Label className="text-xs">Location</Label>
            <PlaceInput
              value={stop.address ?? ""}
              placeholder="Search stop address…"
              onPlace={(p) => onChange({ address: p.address, lat: p.lat, lng: p.lng, name: stop.name || p.address })}
              onClear={() => onChange({ address: "", lat: null, lng: null })}
            />
          </div>
          <div className="md:col-span-1">
            <Label className="text-xs">Dwell (min)</Label>
            <Input
              type="number" min={0}
              value={stop.dwell_min == null ? "" : String(stop.dwell_min)}
              placeholder={String(defaultDwell)}
              onChange={(e) => {
                const v = e.target.value;
                onChange({ dwell_min: v === "" ? null : Number(v) });
              }}
            />
          </div>
          <div className="md:col-span-1">
            <Label className="text-xs">Arrival</Label>
            <Input
              type="time"
              value={stop.arrival_time ?? ""}
              onChange={(e) => onChange({ arrival_time: e.target.value, manual_time: true })}
            />
          </div>
          <div className="md:col-span-1">
            <Label className="text-xs">Departure</Label>
            <Input
              type="time"
              value={stop.departure_time ?? ""}
              onChange={(e) => onChange({ departure_time: e.target.value, manual_time: true })}
            />
          </div>
          <div className="md:col-span-1 flex flex-col items-end justify-end">
            {stop.manual_time ? (
              <Button
                type="button" variant="ghost" size="sm"
                className="h-8 px-2 text-xs"
                onClick={() => onChange({ manual_time: false })}
                title="Reset to Google ETA"
              >
                <RotateCcw className="mr-1 h-3 w-3" /> Reset
              </Button>
            ) : null}
          </div>
        </div>
        <Button type="button" variant="ghost" size="icon" onClick={onRemove} className="mt-1 text-destructive">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 pl-6 text-[11px] text-muted-foreground">
        {driveMin != null && (
          <Badge variant="outline" className="gap-1 font-normal">
            <Navigation className="h-3 w-3" /> {driveMin} min from previous
          </Badge>
        )}
        {distKm != null && (
          <Badge variant="outline" className="gap-1 font-normal">
            <RouteIcon className="h-3 w-3" /> {distKm} km
          </Badge>
        )}
        <Badge variant="outline" className="gap-1 font-normal">
          <Clock className="h-3 w-3" /> Dwell {dwellEffective} min
          {stop.dwell_min == null ? " (default)" : ""}
        </Badge>
        {stop.manual_time && (
          <Badge variant="secondary" className="gap-1 font-normal">
            Manual override
          </Badge>
        )}
      </div>
    </Card>
  );
}

/* ---------------- Places autocomplete input ---------------- */

interface PlaceInputProps {
  value: string;
  placeholder?: string;
  onPlace: (p: RoutePoint) => void;
  onClear?: () => void;
}

interface Suggestion {
  id: string;
  primary: string;
  secondary: string;
  placeId: string;
}

function PlaceInput({ value, placeholder, onPlace, onClear }: PlaceInputProps) {
  const [text, setText] = useState(value);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const tokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const placesLibRef = useRef<google.maps.PlacesLibrary | null>(null);
  const abortRef = useRef<number>(0);

  useEffect(() => { setText(value); }, [value]);

  const ensureLib = async () => {
    if (placesLibRef.current) return placesLibRef.current;
    const g = await loadGoogleMaps(["places"]);
    const lib = (await g.maps.importLibrary("places")) as google.maps.PlacesLibrary;
    placesLibRef.current = lib;
    tokenRef.current = new lib.AutocompleteSessionToken();
    return lib;
  };

  const search = async (q: string) => {
    const my = ++abortRef.current;
    if (!q.trim() || q.trim().length < 2) { setItems([]); return; }
    setLoading(true);
    try {
      const lib = await ensureLib();
      const { suggestions } = await lib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input: q,
        sessionToken: tokenRef.current ?? undefined,
      });
      if (my !== abortRef.current) return;
      const mapped: Suggestion[] = [];
      for (const s of suggestions) {
        const p = s.placePrediction;
        if (!p) continue;
        mapped.push({
          id: p.placeId,
          placeId: p.placeId,
          primary: p.mainText?.toString() ?? p.text?.toString() ?? "",
          secondary: p.secondaryText?.toString() ?? "",
        });
      }
      setItems(mapped);
    } catch {
      setItems([]);
    } finally {
      if (my === abortRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    const t = window.setTimeout(() => { if (open) void search(text); }, 220);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, open]);

  const pick = async (s: Suggestion) => {
    const lib = await ensureLib();
    const place = new lib.Place({ id: s.placeId });
    await place.fetchFields({ fields: ["formattedAddress", "location", "displayName"] });
    const loc = place.location;
    const address = place.formattedAddress ?? place.displayName ?? `${s.primary} ${s.secondary}`.trim();
    onPlace({
      address,
      lat: loc ? loc.lat() : null,
      lng: loc ? loc.lng() : null,
    });
    setText(address);
    setOpen(false);
    tokenRef.current = new lib.AutocompleteSessionToken();
  };

  return (
    <div className="relative">
      <div className="flex gap-1">
        <Input
          value={text}
          placeholder={placeholder}
          onChange={(e) => { setText(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 180)}
        />
        {text && onClear && (
          <Button type="button" variant="ghost" size="sm" onClick={() => { setText(""); onClear(); }}>
            Clear
          </Button>
        )}
      </div>
      {open && (items.length > 0 || loading) && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-md">
          {loading && (
            <div className="px-3 py-2 text-xs text-muted-foreground">Searching…</div>
          )}
          {items.map((s) => (
            <button
              type="button"
              key={s.id}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => void pick(s)}
              className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
            >
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{s.primary}</div>
                {s.secondary && <div className="truncate text-xs text-muted-foreground">{s.secondary}</div>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
