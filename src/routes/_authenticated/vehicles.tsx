import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, EmptyState } from "@/components/page-header";

export const Route = createFileRoute("/_authenticated/vehicles")({
  head: () => ({ meta: [{ title: "Vehicles" }] }),
  component: () => (
    <>
      <PageHeader title="Vehicles" description="School-owned vehicles." />
      <EmptyState title="Coming soon" description="Vehicle management will be added in the next module." />
    </>
  ),
});
