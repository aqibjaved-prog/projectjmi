import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import {
  routeSchema, ROUTE_TYPES, ROUTE_COLORS, routeTypeLabel, newStop,
  type RouteFormValues,
} from "@/lib/routes";
import type { z } from "zod";
import { stopSchema } from "@/lib/routes";
type StopValue = z.input<typeof stopSchema>;
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, arrayMove, useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

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
};

export function RouteForm({ defaults, drivers = [], vehicles = [], submitting, submitLabel = "Save", onSubmit }: Props) {
  const form = useForm<RouteFormValues>({
    resolver: zodResolver(routeSchema),
    defaultValues: { ...DEFAULTS, ...defaults },
  });

  const { fields, append, remove, move, update } = useFieldArray({
    control: form.control,
    name: "stops",
    keyName: "_key",
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = fields.findIndex((f) => f.id === active.id);
    const newIndex = fields.findIndex((f) => f.id === over.id);
    if (oldIndex >= 0 && newIndex >= 0) move(oldIndex, newIndex);
  };

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
          <FormField name="starting_point" control={form.control} render={({ field }) => (
            <FormItem><FormLabel>Starting point</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField name="ending_point" control={form.control} render={({ field }) => (
            <FormItem><FormLabel>Ending point</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField name="start_lat" control={form.control} render={({ field }) => (
            <FormItem><FormLabel>Start latitude</FormLabel><FormControl><Input {...field} inputMode="decimal" placeholder="12.9716" /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField name="start_lng" control={form.control} render={({ field }) => (
            <FormItem><FormLabel>Start longitude</FormLabel><FormControl><Input {...field} inputMode="decimal" placeholder="77.5946" /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField name="end_lat" control={form.control} render={({ field }) => (
            <FormItem><FormLabel>End latitude</FormLabel><FormControl><Input {...field} inputMode="decimal" /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField name="end_lng" control={form.control} render={({ field }) => (
            <FormItem><FormLabel>End longitude</FormLabel><FormControl><Input {...field} inputMode="decimal" /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField name="total_distance" control={form.control} render={({ field }) => (
            <FormItem><FormLabel>Total distance (km)</FormLabel><FormControl><Input {...field} inputMode="decimal" /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField name="estimated_duration" control={form.control} render={({ field }) => (
            <FormItem><FormLabel>Estimated duration (min)</FormLabel><FormControl><Input {...field} inputMode="numeric" /></FormControl><FormMessage /></FormItem>
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

        {/* Stops */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <Label className="text-sm font-medium">Stops</Label>
            <Button type="button" size="sm" variant="outline" onClick={() => append(newStop(fields.length))}>
              <Plus className="mr-1 h-4 w-4" /> Add stop
            </Button>
          </div>
          {fields.length === 0 ? (
            <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              No stops yet. Click "Add stop" to build the route.
            </p>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {fields.map((f, i) => (
                    <SortableStop
                      key={f._key}
                      id={f.id}
                      index={i}
                      value={f as unknown as RouteFormValues["stops"][number]}
                      onChange={(v) => update(i, v as never)}
                      onRemove={() => remove(i)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="submit" disabled={submitting}>{submitting ? "Saving…" : submitLabel}</Button>
        </div>
      </form>
    </Form>
  );
}

function SortableStop({
  id, index, value, onChange, onRemove,
}: {
  id: string;
  index: number;
  value: RouteFormValues["stops"][number];
  onChange: (v: RouteFormValues["stops"][number]) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 };

  const set = <K extends keyof RouteFormValues["stops"][number]>(k: K, v: RouteFormValues["stops"][number][K]) =>
    onChange({ ...value, [k]: v });

  return (
    <Card ref={setNodeRef} style={style} className="p-3">
      <div className="flex items-start gap-2">
        <button type="button" className="mt-2 cursor-grab text-muted-foreground touch-none" {...attributes} {...listeners}>
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="grid flex-1 gap-2 md:grid-cols-6">
          <div className="md:col-span-1">
            <Label className="text-xs">#</Label>
            <div className="mt-1 flex h-9 items-center rounded-md border bg-muted/40 px-3 text-sm">{index + 1}</div>
          </div>
          <div className="md:col-span-2">
            <Label className="text-xs">Stop name *</Label>
            <Input value={value.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div className="md:col-span-3">
            <Label className="text-xs">Address</Label>
            <Input value={value.address ?? ""} onChange={(e) => set("address", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Latitude</Label>
            <Input inputMode="decimal" value={value.lat as unknown as string ?? ""} onChange={(e) => set("lat", e.target.value as unknown as number)} />
          </div>
          <div>
            <Label className="text-xs">Longitude</Label>
            <Input inputMode="decimal" value={value.lng as unknown as string ?? ""} onChange={(e) => set("lng", e.target.value as unknown as number)} />
          </div>
          <div>
            <Label className="text-xs">Arrival</Label>
            <Input type="time" value={value.arrival_time ?? ""} onChange={(e) => set("arrival_time", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Departure</Label>
            <Input type="time" value={value.departure_time ?? ""} onChange={(e) => set("departure_time", e.target.value)} />
          </div>
        </div>
        <Button type="button" variant="ghost" size="icon" onClick={onRemove} className="mt-1 text-destructive">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </Card>
  );
}
