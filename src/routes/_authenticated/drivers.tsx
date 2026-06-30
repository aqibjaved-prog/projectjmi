import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, EmptyState } from "@/components/page-header";

export const Route = createFileRoute("/_authenticated/drivers")({
  head: () => ({ meta: [{ title: "Drivers" }] }),
  component: () => (
    <>
      <PageHeader title="Drivers" description="Drivers assigned to your school's fleet." />
      <EmptyState title="Coming soon" description="Driver management will be added in the next module." />
    </>
  ),
});
