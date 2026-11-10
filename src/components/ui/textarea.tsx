import * as React from "react";
import { cn } from "@/lib/utils";

// Figma "Text Area": same border states as Input, 120px tall by default.
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-30 w-full p-3 rounded-sm border border-input bg-background text-body transition-[color,border-color,box-shadow] outline-none placeholder:text-gray-400 hover:border-primary hover:inset-ring-1 hover:inset-ring-primary focus-visible:border-primary focus-visible:inset-ring-1 focus-visible:inset-ring-primary disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40 aria-invalid:border-red-600 aria-invalid:bg-red-50 aria-invalid:inset-ring-1 aria-invalid:inset-ring-red-600",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
