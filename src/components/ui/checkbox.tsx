"use client";

import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import { CheckIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// Figma "Checkbox": 16px with a 2px radius, gray outline, filled blue when
// checked or indeterminate (a white dash, e.g. a partly selected "select all").
function Checkbox({ className, ...props }: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer group/checkbox relative flex size-4 shrink-0 items-center justify-center rounded-xs border border-gray-400 bg-background text-primary-foreground transition-colors outline-none group-has-disabled/field:opacity-40 group-has-[:focus-visible]/field-label:ring-0 after:absolute after:-inset-x-3 after:-inset-y-2 hover:border-gray-500 focus-visible:ring-4 focus-visible:ring-ring/25 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-40 aria-invalid:border-destructive data-checked:border-primary data-checked:bg-primary data-checked:hover:bg-[color-mix(in_srgb,var(--primary),black_12%)] data-indeterminate:border-primary data-indeterminate:bg-primary data-indeterminate:hover:bg-[color-mix(in_srgb,var(--primary),black_12%)]",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center transition-none [&>svg]:size-3"
      >
        <CheckIcon className="group-data-indeterminate/checkbox:hidden" />
        <span className="hidden h-0.5 w-2 rounded-full bg-current group-data-indeterminate/checkbox:block" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
