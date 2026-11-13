import * as React from "react";
import { cn } from "@/lib/utils";

// Figma "Text Area": same border states as Input, 120px tall by default.
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-30 w-full resize-y rounded-sm border border-gray-300 bg-gray-0 p-3 text-body transition-shadow outline-none placeholder:text-gray-400 focus-visible:border-blue-primary focus-visible:inset-ring focus-visible:inset-ring-blue-primary focus-visible:ring-4 focus-visible:ring-blue-primary/25 disabled:cursor-not-allowed disabled:opacity-40 aria-invalid:border-red-600 aria-invalid:bg-red-50 aria-invalid:inset-ring aria-invalid:inset-ring-red-600",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
