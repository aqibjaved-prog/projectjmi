import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderModule } from "@/components/placeholder-module";

export const Route = createFileRoute("/_authenticated/parent/dashboard")({
  component: () => (
    <PlaceholderModule
      title="Parent Portal"
      message="Parent module coming soon."
    />
  ),
});
