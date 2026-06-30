import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, EmptyState } from "@/components/page-header";

export const Route = createFileRoute("/_authenticated/my-children")({
  head: () => ({ meta: [{ title: "My children" }] }),
  component: () => (
    <>
      <PageHeader title="My children" description="Students linked to your parent account." />
      <EmptyState title="No children linked yet" description="Your school admin will link your children to your account." />
    </>
  ),
});
