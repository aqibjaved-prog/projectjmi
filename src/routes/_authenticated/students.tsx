import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, EmptyState } from "@/components/page-header";

export const Route = createFileRoute("/_authenticated/students")({
  head: () => ({ meta: [{ title: "Students" }] }),
  component: () => (
    <>
      <PageHeader title="Students" description="Manage students enrolled in transport." />
      <EmptyState title="Coming soon" description="Student management will be added in the next module." />
    </>
  ),
});
