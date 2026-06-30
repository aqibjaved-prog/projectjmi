import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, EmptyState } from "@/components/page-header";

export const Route = createFileRoute("/_authenticated/routes")({
  head: () => ({ meta: [{ title: "Routes" }] }),
  component: () => (
    <>
      <PageHeader title="Routes" description="Pickup & drop routes and stops." />
      <EmptyState title="Coming soon" description="Route management will be added in the next module." />
    </>
  ),
});
