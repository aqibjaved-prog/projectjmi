import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  routeSchema, ROUTE_TYPES, ROUTE_COLORS, routeTypeLabel,
  type RouteFormValues, type RouteStop,
} from "@/lib/routes";
import { RouteMapEditor, type RoutePoint } from "@/components/routes/route-map-editor";

interface Props {
  defaults?: Partial<RouteFormValues>;
  drivers?: Array<{ id: string; full_name: string }>;
  vehicles?: Array<{ id: string; registration_number: string; vehicle_code: string | null; capacity: number }>;
  submitting?: boolean;
  submitLabel?: string;
  onSubmit: (values: RouteFormValues) => void;
}

const DEFAULTS: RouteFormValues = {
  name: "",
  route_type: "both",
  is_active: true,
  starting_point: "",
  ending_point: "",
  start_lat: "",
  start_lng: "",
  end_lat: "",
  end_lng: "",
  total_distance: "",
  estimated_duration: "",
  pickup_start_time: "",
  drop_start_time: "",
  max_students: "",
  route_color: ROUTE_COLORS[0],
  vehicle_id: null,
  driver_id: null,
  notes: "",
  stops: [],
  default_dwell_min: "2",
  end_leg_seconds: null,
  end_leg_distance_m: null,
};

const toNum = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export function RouteForm({ defaults, drivers = [], vehicles = [], submitting, submitLabel = "Save", onSubmit }: Props) {
  const form = useForm<RouteFormValues>({
    resolver: zodResolver(routeSchema),
    defaultValues: { ...DEFAULTS, ...defaults },
  });

  const values = form.watch();
  const start: RoutePoint = {
    address: values.starting_point ?? "",
    lat: toNum(values.start_lat),
    lng: toNum(values.start_lng),
  };
  const end: RoutePoint = {
    address: values.ending_point ?? "",
    lat: toNum(values.end_lat),
    lng: toNum(values.end_lng),
  };
  const stops: RouteStop[] = (values.stops ?? []).map((s, i) => ({
    id: s.id,
    name: s.name,
    order: typeof s.order === "number" ? s.order : i,
    address: (s.address as string | null | undefined) ?? "",
    lat: toNum(s.lat),
    lng: toNum(s.lng),
    arrival_time: (s.arrival_time as string | null | undefined) ?? "",
    departure_time: (s.departure_time as string | null | undefined) ?? "",
  }));

  const setStart = (p: RoutePoint) => {
    form.setValue("starting_point", p.address, { shouldDirty: true });
    form.setValue("start_lat", p.lat == null ? "" : String(p.lat), { shouldDirty: true });
    form.setValue("start_lng", p.lng == null ? "" : String(p.lng), { shouldDirty: true });
  };
  const setEnd = (p: RoutePoint) => {
    form.setValue("ending_point", p.address, { shouldDirty: true });
    form.setValue("end_lat", p.lat == null ? "" : String(p.lat), { shouldDirty: true });
    form.setValue("end_lng", p.lng == null ? "" : String(p.lng), { shouldDirty: true });
  };
  const setStops = (next: RouteStop[]) => {
    form.setValue(
      "stops",
      next.map((s, i) => ({ ...s, order: i })) as RouteFormValues["stops"],
      { shouldDirty: true },
    );
  };
  const setSummary = (s: { distanceKm: number | null; durationMin: number | null }) => {
    form.setValue("total_distance", s.distanceKm == null ? "" : String(s.distanceKm), { shouldDirty: true });
    form.setValue("estimated_duration", s.durationMin == null ? "" : String(s.durationMin), { shouldDirty: true });
  };
  const setEndLeg = (info: { seconds: number | null; meters: number | null }) => {
    form.setValue("end_leg_seconds", info.seconds, { shouldDirty: true });
    form.setValue("end_leg_distance_m", info.meters, { shouldDirty: true });
  };
  const dwellDefault = (() => {
    const n = Number(values.default_dwell_min);
    return Number.isFinite(n) && n >= 0 ? n : 2;
  })();

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Basics */}
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField name="name" control={form.control} render={({ field }) => (
            <FormItem>
              <FormLabel>Route name *</FormLabel>
              <FormControl><Input {...field} placeholder="Morning Route A" /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField name="route_type" control={form.control} render={({ field }) => (
            <FormItem>
              <FormLabel>Route type *</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                <SelectContent>
                  {ROUTE_TYPES.map((t) => <SelectItem key={t} value={t}>{routeTypeLabel(t)}</SelectItem>)}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />
          <FormField name="pickup_start_time" control={form.control} render={({ field }) => (
            <FormItem><FormLabel>Pickup start</FormLabel><FormControl><Input type="time" {...field} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField name="drop_start_time" control={form.control} render={({ field }) => (
            <FormItem><FormLabel>Drop start</FormLabel><FormControl><Input type="time" {...field} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField name="max_students" control={form.control} render={({ field }) => (
            <FormItem><FormLabel>Maximum students</FormLabel><FormControl><Input {...field} inputMode="numeric" placeholder="e.g. 40" /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField name="route_color" control={form.control} render={({ field }) => (
            <FormItem>
              <FormLabel>Route color</FormLabel>
              <div className="flex flex-wrap gap-2">
                {ROUTE_COLORS.map((c) => (
                  <button key={c} type="button"
                    onClick={() => field.onChange(c)}
                    className={`h-7 w-7 rounded-full border-2 ${field.value === c ? "border-foreground" : "border-transparent"}`}
                    style={{ backgroundColor: c }}
                    aria-label={c}
                  />
                ))}
              </div>
              <FormMessage />
            </FormItem>
          )} />
        </div>

        {/* Map + places + stops */}
        <div className="rounded-lg border p-4">
          <div className="mb-3 flex items-baseline justify-between">
            <h4 className="text-sm font-semibold">Route on map</h4>
            <span className="text-xs text-muted-foreground">
              Distance &amp; duration are calculated automatically from Google Maps.
            </span>
          </div>
          <RouteMapEditor
            start={start}
            end={end}
            stops={stops}
            color={values.route_color || ROUTE_COLORS[0]}
            maxStops={toNum(values.max_students)}
            onStartChange={setStart}
            onEndChange={setEnd}
            onStopsChange={setStops}
            onSummaryChange={setSummary}
          />
        </div>

        {/* Assignments */}
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField name="driver_id" control={form.control} render={({ field }) => (
            <FormItem>
              <FormLabel>Assign driver</FormLabel>
              <Select value={field.value ?? "none"} onValueChange={(v) => field.onChange(v === "none" ? null : v)}>
                <FormControl><SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger></FormControl>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {drivers.map((d) => <SelectItem key={d.id} value={d.id}>{d.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
              {drivers.length === 0 && <p className="text-xs text-muted-foreground">No drivers available. Add drivers first.</p>}
              <FormMessage />
            </FormItem>
          )} />
          <FormField name="vehicle_id" control={form.control} render={({ field }) => (
            <FormItem>
              <FormLabel>Assign vehicle</FormLabel>
              <Select value={field.value ?? "none"} onValueChange={(v) => field.onChange(v === "none" ? null : v)}>
                <FormControl><SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger></FormControl>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {vehicles.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {(v.vehicle_code ?? v.registration_number)} — cap {v.capacity}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {vehicles.length === 0 && <p className="text-xs text-muted-foreground">No vehicles available. Add vehicles first.</p>}
              <FormMessage />
            </FormItem>
          )} />
        </div>

        <FormField name="is_active" control={form.control} render={({ field }) => (
          <FormItem className="flex items-center justify-between rounded-lg border p-3">
            <div><FormLabel>Active</FormLabel><p className="text-xs text-muted-foreground">Inactive routes are hidden from operations.</p></div>
            <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
          </FormItem>
        )} />

        <FormField name="notes" control={form.control} render={({ field }) => (
          <FormItem><FormLabel>Notes</FormLabel><FormControl><Textarea rows={3} {...field} /></FormControl><FormMessage /></FormItem>
        )} />

        <div className="flex justify-end gap-2 pt-2">
          <Button type="submit" disabled={submitting}>{submitting ? "Saving…" : submitLabel}</Button>
        </div>
      </form>
    </Form>
  );
}
