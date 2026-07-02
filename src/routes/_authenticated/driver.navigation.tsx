import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useDriverTrips } from "@/lib/driver-portal";
import { Navigation as NavIcon, MapPin, ExternalLink, SkipForward } from "lucide-react";

export const Route = createFileRoute("/_authenticated/driver/navigation")({
  head: () => ({ meta: [{ title: "Navigation" }] }),
  component: NavPage,
});

function NavPage() {
  const { data: trips } = useDriverTrips();
  const active = useMemo(() => trips?.find((t) => t.status === "in_progress" || t.status === "paused") ?? trips?.find((t) => t.status === "scheduled" || t.status === "ready") ?? null, [trips]);

  if (!active) {
    return (
      <div className="space-y-4">
        <PageHeader title="Navigation" description="Turn-by-turn to your next stop." />
        <EmptyState title="No active trip" description="Start today's trip to enable navigation." />
      </div>
    );
  }

  const nextStop = active.stop_progress.find((s) => s.status !== "departed" && s.status !== "skipped");
  const upcoming = active.stop_progress.filter((s) => s.status !== "departed" && s.status !== "skipped").slice(1, 6);
  const end = active.routes?.end_lat != null ? { lat: Number(active.routes.end_lat), lng: Number(active.routes.end_lng) } : null;

  const mapsLink = (lat: number, lng: number) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Navigation"
        description={active.name ?? active.routes?.name ?? "Trip"}
        actions={<Button variant="ghost" asChild><Link to="/driver/trip/$tripId" params={{ tripId: active.id }}>Open live trip</Link></Button>}
      />

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><MapPin className="h-4 w-4" /> Next stop</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {nextStop ? (
            <>
              <div>
                <div className="text-lg font-semibold">{nextStop.name}</div>
                <div className="text-sm text-muted-foreground">ETA {nextStop.scheduled_arrival ?? "—"}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                {nextStop.lat != null && nextStop.lng != null && (
                  <Button asChild size="lg">
                    <a href={mapsLink(Number(nextStop.lat), Number(nextStop.lng))} target="_blank" rel="noreferrer">
                      <NavIcon className="mr-2 h-5 w-5" /> Navigate to next stop
                    </a>
                  </Button>
                )}
                <Button asChild size="lg" variant="outline">
                  <a href="https://maps.google.com" target="_blank" rel="noreferrer">
                    <ExternalLink className="mr-2 h-5 w-5" /> Open Google Maps
                  </a>
                </Button>
                <Button asChild size="lg" variant="ghost">
                  <Link to="/driver/trip/$tripId" params={{ tripId: active.id }}>
                    <SkipForward className="mr-2 h-5 w-5" /> Skip stop
                  </Link>
                </Button>
              </div>
            </>
          ) : (
            <div className="text-sm text-muted-foreground">All stops complete. Head to end point.</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Upcoming stops</CardTitle></CardHeader>
        <CardContent>
          {upcoming.length === 0 ? (
            <div className="text-sm text-muted-foreground">No further stops.</div>
          ) : (
            <ul className="space-y-2">
              {upcoming.map((s, i) => (
                <li key={s.stop_id} className="flex items-center justify-between rounded-md border p-3">
                  <div>
                    <div className="font-medium">{i + 2}. {s.name}</div>
                    <div className="text-xs text-muted-foreground">ETA {s.scheduled_arrival ?? "—"}</div>
                  </div>
                  <Badge variant="outline">{s.status ?? "pending"}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {end && (
        <Card>
          <CardHeader><CardTitle className="text-base">Trip end point</CardTitle></CardHeader>
          <CardContent>
            <div className="mb-2 text-sm text-muted-foreground">{active.routes?.ending_point ?? `${end.lat.toFixed(5)}, ${end.lng.toFixed(5)}`}</div>
            <Button asChild variant="outline">
              <a href={mapsLink(end.lat, end.lng)} target="_blank" rel="noreferrer"><NavIcon className="mr-2 h-4 w-4" /> Navigate to end</a>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
