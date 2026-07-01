import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  vehicleSchema, VEHICLE_TYPES, FUEL_TYPES, VEHICLE_STATUSES,
  vehicleTypeLabel, fuelTypeLabel, vehicleStatusLabel,
  type VehicleFormValues,
} from "@/lib/vehicles";

interface Props {
  defaults?: Partial<VehicleFormValues>;
  submitting?: boolean;
  submitLabel?: string;
  photoPreviewUrl?: string | null;
  onSubmit: (values: VehicleFormValues, photo: File | null) => void;
}

const DEFAULTS: VehicleFormValues = {
  vehicle_number: "",
  registration_number: "",
  vehicle_type: "school_van",
  brand: "",
  model: "",
  manufacturing_year: "",
  capacity: "",
  fuel_type: "",
  color: "",
  chassis_number: "",
  engine_number: "",
  insurance_number: "",
  insurance_expiry: "",
  fitness_number: "",
  fitness_expiry: "",
  pollution_number: "",
  pollution_expiry: "",
  rc_number: "",
  gps_device_id: "",
  notes: "",
  status: "active",
};

export function VehicleForm({ defaults, submitting, submitLabel = "Save vehicle", photoPreviewUrl, onSubmit }: Props) {
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(photoPreviewUrl ?? null);

  const form = useForm<VehicleFormValues>({
    resolver: zodResolver(vehicleSchema),
    defaultValues: { ...DEFAULTS, ...defaults },
  });

  const handleFile = (f: File | null) => {
    setPhoto(f);
    if (f) {
      const url = URL.createObjectURL(f);
      setPreview(url);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((v) => onSubmit(v, photo))} className="space-y-6">
        {/* Photo */}
        <section className="grid gap-3 sm:grid-cols-[auto,1fr] sm:items-start">
          <div className="grid h-28 w-28 place-items-center overflow-hidden rounded-md border bg-muted text-muted-foreground text-xs">
            {preview ? <img src={preview} alt="" className="h-full w-full object-cover" /> : "No photo"}
          </div>
          <div className="space-y-2">
            <Label htmlFor="vehicle-photo">Vehicle photo</Label>
            <Input
              id="vehicle-photo"
              type="file"
              accept="image/*"
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            />
            <p className="text-xs text-muted-foreground">PNG or JPG. Optional.</p>
          </div>
        </section>

        {/* Identity */}
        <section className="grid gap-4 sm:grid-cols-2">
          <FormField control={form.control} name="vehicle_number" render={({ field }) => (
            <FormItem>
              <FormLabel>Vehicle number *</FormLabel>
              <FormControl><Input {...field} placeholder="e.g. VAN-01" /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="registration_number" render={({ field }) => (
            <FormItem>
              <FormLabel>Registration number *</FormLabel>
              <FormControl><Input {...field} placeholder="e.g. MH12AB1234" /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="vehicle_type" render={({ field }) => (
            <FormItem>
              <FormLabel>Vehicle type *</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                <SelectContent>
                  {VEHICLE_TYPES.map((t) => <SelectItem key={t} value={t}>{vehicleTypeLabel(t)}</SelectItem>)}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="status" render={({ field }) => (
            <FormItem>
              <FormLabel>Status</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                <SelectContent>
                  {VEHICLE_STATUSES.map((s) => <SelectItem key={s} value={s}>{vehicleStatusLabel(s)}</SelectItem>)}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />
        </section>

        {/* Vehicle details */}
        <section className="grid gap-4 sm:grid-cols-3">
          <FormField control={form.control} name="brand" render={({ field }) => (
            <FormItem><FormLabel>Brand</FormLabel><FormControl><Input {...field} placeholder="Tata" /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="model" render={({ field }) => (
            <FormItem><FormLabel>Model</FormLabel><FormControl><Input {...field} placeholder="Winger" /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="manufacturing_year" render={({ field }) => (
            <FormItem><FormLabel>Manufacturing year</FormLabel><FormControl><Input {...field} placeholder="2022" inputMode="numeric" /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="capacity" render={({ field }) => (
            <FormItem><FormLabel>Seating capacity *</FormLabel><FormControl><Input {...field} type="number" min={1} max={200} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="fuel_type" render={({ field }) => (
            <FormItem>
              <FormLabel>Fuel type</FormLabel>
              <Select value={field.value ?? ""} onValueChange={field.onChange}>
                <FormControl><SelectTrigger><SelectValue placeholder="Select fuel" /></SelectTrigger></FormControl>
                <SelectContent>
                  {FUEL_TYPES.map((t) => <SelectItem key={t} value={t}>{fuelTypeLabel(t)}</SelectItem>)}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="color" render={({ field }) => (
            <FormItem><FormLabel>Color</FormLabel><FormControl><Input {...field} placeholder="Yellow" /></FormControl><FormMessage /></FormItem>
          )} />
        </section>

        {/* Legal / identifiers */}
        <section className="grid gap-4 sm:grid-cols-2">
          <FormField control={form.control} name="chassis_number" render={({ field }) => (
            <FormItem><FormLabel>Chassis number</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="engine_number" render={({ field }) => (
            <FormItem><FormLabel>Engine number</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="rc_number" render={({ field }) => (
            <FormItem><FormLabel>RC number</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="gps_device_id" render={({ field }) => (
            <FormItem><FormLabel>GPS device ID</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
          )} />
        </section>

        {/* Insurance */}
        <section className="grid gap-4 sm:grid-cols-2">
          <FormField control={form.control} name="insurance_number" render={({ field }) => (
            <FormItem><FormLabel>Insurance number</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="insurance_expiry" render={({ field }) => (
            <FormItem><FormLabel>Insurance expiry</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="fitness_number" render={({ field }) => (
            <FormItem><FormLabel>Fitness certificate #</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="fitness_expiry" render={({ field }) => (
            <FormItem><FormLabel>Fitness expiry</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="pollution_number" render={({ field }) => (
            <FormItem><FormLabel>Pollution certificate #</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="pollution_expiry" render={({ field }) => (
            <FormItem><FormLabel>Pollution expiry</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
          )} />
        </section>

        <FormField control={form.control} name="notes" render={({ field }) => (
          <FormItem>
            <FormLabel>Notes</FormLabel>
            <FormControl><Textarea rows={3} {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />

        <div className="flex justify-end">
          <Button type="submit" disabled={submitting}>{submitting ? "Saving…" : submitLabel}</Button>
        </div>
      </form>
    </Form>
  );
}
