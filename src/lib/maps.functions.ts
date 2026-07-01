import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";

function gwHeaders(extra: Record<string, string> = {}): HeadersInit {
  const lovable = process.env.LOVABLE_API_KEY;
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!lovable || !key) {
    throw new Error("Google Maps gateway credentials are not configured");
  }
  return {
    Authorization: `Bearer ${lovable}`,
    "X-Connection-Api-Key": key,
    ...extra,
  };
}

/* ---------------- Directions (Routes API v2) ---------------- */

const pointSchema = z.object({
  lat: z.number().gte(-90).lte(90),
  lng: z.number().gte(-180).lte(180),
});

const directionsInput = z.object({
  origin: pointSchema,
  destination: pointSchema,
  waypoints: z.array(pointSchema).max(25).default([]),
});

export interface DirectionsResult {
  distanceMeters: number;
  durationSeconds: number | null;
  encodedPolyline: string | null;
  legs: Array<{ distanceMeters: number; durationSeconds: number | null }>;
}

function parseDurationSeconds(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const m = v.match(/^(\d+(?:\.\d+)?)s$/);
    if (m) return Math.round(Number(m[1]));
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

export const computeDirections = createServerFn({ method: "POST" })
  .inputValidator((data) => directionsInput.parse(data))
  .handler(async ({ data }): Promise<DirectionsResult> => {
    const body = {
      origin: { location: { latLng: { latitude: data.origin.lat, longitude: data.origin.lng } } },
      destination: { location: { latLng: { latitude: data.destination.lat, longitude: data.destination.lng } } },
      intermediates: data.waypoints.map((w) => ({
        location: { latLng: { latitude: w.lat, longitude: w.lng } },
      })),
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_AWARE",
    };
    const res = await fetch(`${GATEWAY_URL}/routes/directions/v2:computeRoutes`, {
      method: "POST",
      headers: gwHeaders({
        "Content-Type": "application/json",
        "X-Goog-FieldMask":
          "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline,routes.legs.distanceMeters,routes.legs.duration",
      }),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`Directions failed (${res.status}): ${txt.slice(0, 200)}`);
    }
    const json = (await res.json()) as {
      routes?: Array<{
        distanceMeters?: number;
        duration?: string | number;
        polyline?: { encodedPolyline?: string };
        legs?: Array<{ distanceMeters?: number; duration?: string | number }>;
      }>;
    };
    const r = json.routes?.[0];
    if (!r) throw new Error("No route found");
    return {
      distanceMeters: r.distanceMeters ?? 0,
      durationSeconds: parseDurationSeconds(r.duration),
      encodedPolyline: r.polyline?.encodedPolyline ?? null,
      legs: (r.legs ?? []).map((l) => ({
        distanceMeters: l.distanceMeters ?? 0,
        durationSeconds: parseDurationSeconds(l.duration),
      })),
    };
  });

/* ---------------- Reverse geocode ---------------- */

const reverseInput = pointSchema;

export const reverseGeocode = createServerFn({ method: "POST" })
  .inputValidator((data) => reverseInput.parse(data))
  .handler(async ({ data }): Promise<{ address: string }> => {
    const url = `${GATEWAY_URL}/maps/api/geocode/json?latlng=${encodeURIComponent(
      `${data.lat},${data.lng}`,
    )}`;
    const res = await fetch(url, { headers: gwHeaders() });
    if (!res.ok) return { address: "" };
    const json = (await res.json()) as {
      results?: Array<{ formatted_address?: string }>;
    };
    return { address: json.results?.[0]?.formatted_address ?? "" };
  });
