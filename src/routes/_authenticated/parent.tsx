import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/parent")({
  head: () => ({ meta: [{ title: "Parent — School Van Guardian" }] }),
  component: () => <Outlet />,
});
