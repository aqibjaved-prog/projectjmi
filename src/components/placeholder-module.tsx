import { Card, CardContent } from "@/components/ui/card";
import { Construction } from "lucide-react";
import { PageHeader } from "@/components/page-header";

export function PlaceholderModule({
  title,
  message,
  description,
}: {
  title: string;
  message: string;
  description?: string;
}) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-full bg-muted">
            <Construction className="h-6 w-6 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-semibold">{message}</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            This module is part of Phase 2 and will be available shortly.
          </p>
        </CardContent>
      </Card>
    </>
  );
}
