import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, EmptyState } from "@/components/page-header";

export const Route = createFileRoute("/_authenticated/parents")({
  head: () => ({ meta: [{ title: "Parents" }] }),
  component: () => (
    <>
      <PageHeader title="Parents" description="Parent accounts linked to students." />
      <EmptyState title="Coming soon" description="Parent management will be added in the next module." />
    </>
  ),
});
