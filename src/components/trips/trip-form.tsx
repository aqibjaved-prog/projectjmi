import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { tripSchema, TRIP_TYPES, tripTypeLabel, type TripFormValues } from "@/lib/trips";

export interface RouteLite { id: string; name: string; route_code: string | null; driver_id: string | null; vehicle_id: string | null; pickup_start_time: string | null; drop_start_time: string | null }
export interface DriverLite { id: string; full_name: string }
export interface VehicleLite { id: string; registration_number: string; vehicle_code: string | null; status: string }

export function TripForm({
  defaultValues,
  routes, drivers, vehicles,
  submitting = false,
  submitLabel = "Save trip",
  onSubmit,
}: {
  defaultValues?: Partial<TripFormValues>;
  routes: RouteLite[];
  drivers: DriverLite[];
  vehicles: VehicleLite[];
  submitting?: boolean;
  submitLabel?: string;
  onSubmit: (values: TripFormValues) => void;
}) {
  const form = useForm<TripFormValues>({
    resolver: zodResolver(tripSchema),
    defaultValues: {
      name: "",
      trip_type: "pickup",
      trip_date: new Date().toISOString().slice(0, 10),
      expected_start_time: "",
      expected_end_time: "",
      route_id: "",
      driver_id: null,
      vehicle_id: null,
      notes: "",
      ...defaultValues,
    },
  });

  const handleRouteChange = (routeId: string) => {
    form.setValue("route_id", routeId, { shouldValidate: true });
    const r = routes.find((x) => x.id === routeId);
    if (r) {
      if (r.driver_id && !form.getValues("driver_id")) form.setValue("driver_id", r.driver_id);
      if (r.vehicle_id && !form.getValues("vehicle_id")) form.setValue("vehicle_id", r.vehicle_id);
      const t = form.getValues("trip_type");
      const inherited = t === "pickup" ? r.pickup_start_time : t === "drop" ? r.drop_start_time : null;
      if (inherited && !form.getValues("expected_start_time")) {
        form.setValue("expected_start_time", inherited);
      }
    }
  };

  const activeVehicles = vehicles.filter((v) => v.status === "active");

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField control={form.control} name="name" render={({ field }) => (
          <FormItem>
            <FormLabel>Trip name</FormLabel>
            <FormControl><Input placeholder="Morning pickup – Grade 1" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField control={form.control} name="trip_type" render={({ field }) => (
            <FormItem>
              <FormLabel>Trip type</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                <SelectContent>
                  {TRIP_TYPES.map((t) => <SelectItem key={t} value={t}>{tripTypeLabel(t)}</SelectItem>)}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />

          <FormField control={form.control} name="trip_date" render={({ field }) => (
            <FormItem>
              <FormLabel>Date</FormLabel>
              <FormControl><Input type="date" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField control={form.control} name="expected_start_time" render={({ field }) => (
            <FormItem>
              <FormLabel>Expected start time</FormLabel>
              <FormControl><Input type="time" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="expected_end_time" render={({ field }) => (
            <FormItem>
              <FormLabel>Expected end time</FormLabel>
              <FormControl><Input type="time" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
        </div>

        <FormField control={form.control} name="route_id" render={({ field }) => (
          <FormItem>
            <FormLabel>Route</FormLabel>
            <Select value={field.value ?? ""} onValueChange={handleRouteChange}>
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder={routes.length === 0 ? "No routes available" : "Select route"} />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {routes.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {(r.route_code ? `${r.route_code} — ` : "") + r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {routes.length === 0 && (
              <p className="text-xs text-muted-foreground">Create a route first to schedule trips.</p>
            )}
            <FormMessage />
          </FormItem>
        )} />

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField control={form.control} name="driver_id" render={({ field }) => (
            <FormItem>
              <FormLabel>Driver</FormLabel>
              <Select
                value={field.value ?? "__none"}
                onValueChange={(v) => field.onChange(v === "__none" ? null : v)}
              >
                <FormControl><SelectTrigger><SelectValue placeholder="Select driver" /></SelectTrigger></FormControl>
                <SelectContent>
                  <SelectItem value="__none">Unassigned</SelectItem>
                  {drivers.map((d) => <SelectItem key={d.id} value={d.id}>{d.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />

          <FormField control={form.control} name="vehicle_id" render={({ field }) => (
            <FormItem>
              <FormLabel>Vehicle</FormLabel>
              <Select
                value={field.value ?? "__none"}
                onValueChange={(v) => field.onChange(v === "__none" ? null : v)}
              >
                <FormControl><SelectTrigger><SelectValue placeholder="Select vehicle" /></SelectTrigger></FormControl>
                <SelectContent>
                  <SelectItem value="__none">Unassigned</SelectItem>
                  {activeVehicles.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.vehicle_code ?? v.registration_number}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />
        </div>

        <div>
          <Label htmlFor="trip-notes">Notes</Label>
          <Textarea id="trip-notes" rows={3} {...form.register("notes")} placeholder="Optional context, weather, special instructions…" />
        </div>

        <div className="flex justify-end">
          <Button type="submit" disabled={submitting}>{submitting ? "Saving…" : submitLabel}</Button>
        </div>
      </form>
    </Form>
  );
}
