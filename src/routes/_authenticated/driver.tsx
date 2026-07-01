import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/driver")({
  head: () => ({ meta: [{ title: "Driver — School Van Guardian" }] }),
  component: () => <Outlet />,
});
