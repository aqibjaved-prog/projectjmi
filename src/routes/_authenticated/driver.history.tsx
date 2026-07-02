import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useDriverTripHistory } from "@/lib/driver-portal";
import { tripStatusLabel, tripTypeLabel } from "@/lib/trips";
import { Search } from "lucide-react";

export const Route = createFileRoute("/_authenticated/driver/history")({
  head: () => ({ meta: [{ title: "Trip History" }] }),
  component: HistoryPage,
});

function HistoryPage() {
  const { data, isLoading } = useDriverTripHistory(200);
  const [q, setQ] = useState("");
  const trips = (data ?? []).filter((t) => {
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return (t.name ?? "").toLowerCase().includes(s) || (t.trip_code ?? "").toLowerCase().includes(s) || (t.routes?.name ?? "").toLowerCase().includes(s);
  });
  return (
    <div className="space-y-4">
      <PageHeader title="Trip history" description="Your past and upcoming trips." />
      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">{isLoading ? "Loading…" : `${trips.length} trip(s)`}</CardTitle>
          <div className="relative sm:w-64">
            <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="pl-8" />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-40 w-full" /> : trips.length === 0 ? (
            <EmptyState title="No trips yet" description="Completed trips will appear here." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Trip</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Route</TableHead>
                  <TableHead>Distance</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Students</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trips.map((t) => {
                  const durMs = t.started_at && t.ended_at ? new Date(t.ended_at).getTime() - new Date(t.started_at).getTime() : null;
                  const durMin = durMs != null ? Math.round(durMs / 60000) : null;
                  const boarded = t.stop_progress.reduce((n, s) => n + (s.students_boarded ?? 0), 0);
                  return (
                    <TableRow key={t.id}>
                      <TableCell>{t.trip_date}</TableCell>
                      <TableCell><Link className="text-primary hover:underline" to="/driver/trip/$tripId" params={{ tripId: t.id }}>{t.name ?? t.trip_code ?? "Trip"}</Link></TableCell>
                      <TableCell>{tripTypeLabel(t.trip_type)}</TableCell>
                      <TableCell>{t.routes?.name ?? "—"}</TableCell>
                      <TableCell>{t.routes?.total_distance != null ? `${t.routes.total_distance} km` : "—"}</TableCell>
                      <TableCell>{durMin != null ? `${durMin} min` : "—"}</TableCell>
                      <TableCell>{boarded}</TableCell>
                      <TableCell><Badge variant="outline">{tripStatusLabel(t.status)}</Badge></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
