import * as React from "react";
import { cn } from "@/lib/utils";

// Figma "Text Area": same border states as Input, 120px tall by default.
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-30 w-full rounded-lg border border-input bg-background p-3 text-body transition-colors outline-none placeholder:text-neutral-400 focus-visible:border-foreground focus-visible:inset-ring-1 focus-visible:inset-ring-foreground disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-50 aria-invalid:border-destructive aria-invalid:inset-ring-1 aria-invalid:inset-ring-destructive",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
