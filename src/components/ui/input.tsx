import * as React from "react";
import { Input as InputPrimitive } from "@base-ui/react/input";
import { cn } from "@/lib/utils";

// Figma "Text Field": the border turns 2px blue on hover and while typing, and
// 2px red with a red tint when invalid. The extra pixel is an inset ring, so
// the field doesn't shift. Browsers treat any focused text field as
// keyboard-focused, so the Figma "Focused" halo is left to buttons and toggles.
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-11.75 w-full min-w-0 px-3 file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-body-sm file:font-medium file:text-foreground rounded-sm border border-input bg-background text-body transition-[color,border-color,box-shadow] outline-none placeholder:text-gray-400 hover:border-primary hover:inset-ring-1 hover:inset-ring-primary focus-visible:border-primary focus-visible:inset-ring-1 focus-visible:inset-ring-primary disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40 aria-invalid:border-red-600 aria-invalid:bg-red-50 aria-invalid:inset-ring-1 aria-invalid:inset-ring-red-600",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
