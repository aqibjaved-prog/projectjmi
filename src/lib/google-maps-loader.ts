/// <reference types="google.maps" />
// Loads the Google Maps JavaScript API once, using the browser key from the

const BROWSER_KEY = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY as
  | string
  | undefined;
const TRACKING_ID = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID as
  | string
  | undefined;

export function isGoogleMapsConfigured(): boolean {
  return Boolean(BROWSER_KEY);
}

type GoogleNs = typeof google;
let loaderPromise: Promise<GoogleNs> | null = null;

export function loadGoogleMaps(
  libraries: Array<"places" | "geometry" | "marker" | "routes"> = ["places", "geometry"],
): Promise<GoogleNs> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google Maps can only be loaded in the browser"));
  }
  if (!BROWSER_KEY) {
    return Promise.reject(new Error("Google Maps browser key is not configured"));
  }
  const w = window as unknown as { google?: GoogleNs; __lovable_gmaps_cb__?: () => void };
  if (w.google?.maps) return Promise.resolve(w.google);
  if (loaderPromise) return loaderPromise;

  loaderPromise = new Promise((resolve, reject) => {
    const cbName = "__lovable_gmaps_cb__";
    (window as unknown as Record<string, unknown>)[cbName] = () => {
      const g = (window as unknown as { google?: GoogleNs }).google;
      if (g?.maps) resolve(g);
      else reject(new Error("Google Maps failed to initialize"));
    };
    const params = new URLSearchParams({
      key: BROWSER_KEY,
      libraries: libraries.join(","),
      loading: "async",
      callback: cbName,
      v: "weekly",
    });
    if (TRACKING_ID) params.set("channel", TRACKING_ID);
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    s.async = true;
    s.defer = true;
    s.onerror = () => reject(new Error("Failed to load Google Maps script"));
    document.head.appendChild(s);
  });
  return loaderPromise;
}
