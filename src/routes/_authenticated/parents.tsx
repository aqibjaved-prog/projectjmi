import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/parents")({
  head: () => ({ meta: [{ title: "Parents" }] }),
  component: () => <Outlet />,
});
