import type { ReactNode } from "react";

/** A labelled block of an opportunity brief. */
export function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-xs text-muted-foreground">{label}</h3>
      {children}
    </div>
  );
}
