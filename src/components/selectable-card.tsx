import type { ComponentProps, ReactNode } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

type SelectableCardProps = Omit<ComponentProps<typeof Checkbox>, "children" | "className"> & {
  title: ReactNode;
  description?: ReactNode;
  className?: string;
};

/**
 * Figma "Selectable Card": a multi-select option, e.g. a reason for requesting
 * changes. The whole card toggles its checkbox; selected cards turn blue.
 */
export function SelectableCard({ title, description, className, ...props }: SelectableCardProps) {
  return (
    <label
      data-slot="selectable-card"
      className={cn(
        "group/selectable-card flex cursor-pointer items-start gap-3 rounded-sm border border-transparent bg-background px-4 py-3 shadow-raised transition-colors",
        "has-data-checked:border-primary has-data-checked:bg-blue-subtle has-data-checked:shadow-none",
        "has-focus-visible:ring-4 has-focus-visible:ring-ring/25",
        "has-disabled:cursor-not-allowed has-disabled:border-gray-100 has-disabled:opacity-40 has-disabled:shadow-none",
        className,
      )}
    >
      <span className="pt-1">
        <Checkbox
          className="group-hover/selectable-card:not-data-checked:not-data-disabled:border-gray-200 group-hover/selectable-card:not-data-checked:not-data-disabled:bg-gray-200 focus-visible:ring-0"
          {...props}
        />
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-body font-medium text-foreground">{title}</span>
        {description && <span className="text-body-sm text-muted-foreground">{description}</span>}
      </span>
    </label>
  );
}
