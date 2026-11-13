import * as React from "react";
import { Input as InputPrimitive } from "@base-ui/react/input";
import { cn } from "@/lib/utils";

// Figma "Text Field": a 1px gray border that turns blue on focus, with a 1px
// inset outline (so it reads as 2px) and a soft 4px ring. When invalid it is
// red with a red tint; focus still shows the blue ring over the red outline.
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-11.75 w-full min-w-0 rounded-sm border border-gray-300 bg-gray-0 px-3 text-body transition-shadow outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-body-sm file:font-medium file:text-foreground placeholder:text-gray-400 focus-visible:border-blue-primary focus-visible:outline focus-visible:-outline-offset-2 focus-visible:outline-blue-primary focus-visible:ring-4 focus-visible:ring-blue-primary/25 disabled:cursor-not-allowed disabled:opacity-40 aria-invalid:border-red-600 aria-invalid:bg-red-50 aria-invalid:outline aria-invalid:-outline-offset-2 aria-invalid:outline-red-600",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
