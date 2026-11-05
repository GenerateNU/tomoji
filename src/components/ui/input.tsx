import * as React from "react";
import { Input as InputPrimitive } from "@base-ui/react/input";
import { cn } from "@/lib/utils";

// Figma "Text Field": the border thickens to 2px when focused or invalid. The
// extra pixel is an inset ring, so the field doesn't shift.
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-11 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-body transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-body-sm file:font-medium file:text-foreground placeholder:text-neutral-400 focus-visible:border-foreground focus-visible:inset-ring-1 focus-visible:inset-ring-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-50 aria-invalid:border-destructive aria-invalid:inset-ring-1 aria-invalid:inset-ring-destructive",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
