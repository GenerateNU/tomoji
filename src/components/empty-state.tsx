import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** The message shown where a list would be, when the list has nothing in it. */
export function EmptyState({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-2xl bg-muted/60 p-8 text-center text-muted-foreground", className)}>
      {children}
    </div>
  );
}
