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
 * changes. The whole card toggles its checkbox; selected cards turn blue-subtle
 * with a blue-primary outline, and hovering an unchecked card previews the check.
 */
export function SelectableCard({ title, description, className, ...props }: SelectableCardProps) {
  return (
    <label
      data-slot="selectable-card"
      className={cn(
        "group flex w-full cursor-pointer items-start gap-3 rounded-sm bg-gray-0 px-4 py-3 shadow-tile transition-[background-color,box-shadow] has-focus-visible:ring-4 has-focus-visible:ring-blue-primary/25",
        "has-data-checked:bg-blue-subtle has-data-checked:shadow-[inset_0_0_0_1px_var(--color-blue-primary),0_0_25px_-5px_rgba(0,0,0,0.05)]",
        "has-data-disabled:cursor-not-allowed has-data-disabled:opacity-40 has-data-disabled:shadow-[inset_0_0_0_1px_var(--color-gray-100)]",
        className,
      )}
    >
      <span className="flex pt-0.5">
        <Checkbox previewOnHover className="focus-visible:ring-0" {...props} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-body font-medium text-gray-950">{title}</span>
        {description && (
          <span className="text-body-sm font-normal text-gray-500">{description}</span>
        )}
      </span>
    </label>
  );
}
