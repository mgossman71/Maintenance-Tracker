import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function EmptyState({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
        <Icon className="size-10 text-muted-foreground" aria-hidden="true" />
        <h2 className="font-semibold">{title}</h2>
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
        {children}
      </CardContent>
    </Card>
  );
}

export function PageError({ message }: { message: string }) {
  return (
    <Card>
      <CardContent className="p-6 text-sm text-destructive" role="alert">
        {message}
      </CardContent>
    </Card>
  );
}
