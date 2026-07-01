import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderModule } from "@/components/placeholder-module";

export const Route = createFileRoute("/_authenticated/driver/dashboard")({
  component: () => (
    <PlaceholderModule
      title="Driver Portal"
      message="Driver module coming soon."
    />
  ),
});
