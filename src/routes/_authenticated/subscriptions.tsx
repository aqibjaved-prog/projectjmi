import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle } from "lucide-react";
import { subscriptionExpiry, planFor } from "@/lib/schools";

export const Route = createFileRoute("/_authenticated/subscriptions")({
  head: () => ({ meta: [{ title: "Subscriptions" }] }),
  component: SubsPage,
});

function SubsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["subscriptions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("*, schools(id, name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const expiringSoon = (data ?? []).filter((s) => subscriptionExpiry(s.current_period_end) === "expiring_soon").length;
  const expired = (data ?? []).filter((s) => subscriptionExpiry(s.current_period_end) === "expired").length;

  return (
    <>
      <PageHeader title="Subscriptions" description="Billing status per school." />

      {expired + expiringSoon > 0 && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4" />
          {expired > 0 && <span>{expired} expired</span>}
          {expired > 0 && expiringSoon > 0 && <span>·</span>}
          {expiringSoon > 0 && <span>{expiringSoon} expiring within 14 days</span>}
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : !data || data.length === 0 ? (
            <div className="p-4"><EmptyState title="No subscriptions" description="Subscriptions will appear here once schools have plans." /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>School</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Renews</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((s) => {
                  const school = (s as { schools?: { id?: string; name?: string } }).schools;
                  const expiry = subscriptionExpiry(s.current_period_end);
                  const plan = planFor(s.plan_name);
                  return (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">
                        {school?.id ? (
                          <Link to="/schools/$schoolId" params={{ schoolId: school.id }} className="hover:underline">
                            {school.name ?? "—"}
                          </Link>
                        ) : (school?.name ?? "—")}
                      </TableCell>
                      <TableCell>{plan.name}</TableCell>
                      <TableCell>
                        <Badge variant={s.status === "active" ? "default" : "secondary"} className="capitalize">{s.status}</Badge>
                      </TableCell>
                      <TableCell>
                        {s.current_period_end ? (
                          <span className={
                            expiry === "expired" ? "text-destructive" :
                            expiry === "expiring_soon" ? "text-amber-600 dark:text-amber-400" : ""
                          }>
                            {new Date(s.current_period_end).toLocaleDateString()}
                          </span>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {s.currency} {(s.amount_cents / 100).toFixed(2)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}

