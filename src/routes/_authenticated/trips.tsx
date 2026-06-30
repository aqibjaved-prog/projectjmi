import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, EmptyState } from "@/components/page-header";

export const Route = createFileRoute("/_authenticated/trips")({
  head: () => ({ meta: [{ title: "Trips" }] }),
  component: () => (
    <>
      <PageHeader title="Trips" description="Scheduled and in-progress trips." />
      <EmptyState title="Coming soon" description="Trip management will be added in the next module." />
    </>
  ),
});
