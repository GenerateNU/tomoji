"use client";

import * as React from "react";
import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import { indicatorTransition, useSlidingIndicator } from "@/hooks/use-sliding-indicator";
import { iconProps, type IconComponent } from "@/lib/icons";
import { focusRing } from "@/lib/styles";
import { cn } from "@/lib/utils";

type SegmentedControlProps = Omit<
  RadioGroup.Props<string>,
  "value" | "defaultValue" | "onValueChange" | "onChange"
> & {
  /** Selected segment value (controlled). */
  value?: string;
  /** Initial value when uncontrolled. */
  defaultValue?: string;
  /** Called with the selected segment's value. */
  onChange?: (value: string) => void;
};

/**
 * Figma "Segmented Control": a gray track of segments where the selected one
 * is a white raised pill that slides between them. Arrow keys move and select.
 */
function SegmentedControl({
  value,
  defaultValue,
  onChange,
  className,
  children,
  ...props
}: SegmentedControlProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const { style, animate } = useSlidingIndicator(ref, '[role="radio"][aria-checked="true"]');

  return (
    <RadioGroup
      ref={ref}
      data-slot="segmented-control"
      value={value}
      defaultValue={defaultValue}
      onValueChange={(next) => onChange?.(next)}
      className={cn(
        "relative inline-flex items-center gap-0.5 rounded-lg bg-gray-50 p-1",
        className,
      )}
      {...props}
    >
      {style && (
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-y-1 left-0 rounded bg-gray-0 shadow-segment",
            animate && indicatorTransition,
          )}
          style={style}
        />
      )}
      {children}
    </RadioGroup>
  );
}

type SegmentProps = Omit<Radio.Root.Props<string>, "value" | "children"> & {
  /** Identifies the segment. */
  value: string;
  /** Visible text, or the accessible name and tooltip of an icon segment. */
  label: string;
  /** Makes it an icon segment, e.g. icon={RiFunctionLine}. */
  icon?: IconComponent;
};

function Segment({ value, label, icon: Icon, className, ...props }: SegmentProps) {
  return (
    <Radio.Root
      data-slot="segment"
      value={value}
      aria-label={Icon ? label : undefined}
      title={Icon ? label : undefined}
      className={cn(
        "relative inline-flex cursor-pointer items-center justify-center rounded whitespace-nowrap transition-colors data-disabled:cursor-not-allowed data-disabled:opacity-40",
        focusRing,
        Icon ? "p-1.5" : "px-3 py-1.5 text-body-sm font-medium",
        "text-gray-500 not-data-disabled:hover:bg-gray-100 not-data-disabled:hover:text-gray-950 data-checked:text-gray-950 data-checked:hover:bg-transparent",
        className,
      )}
      {...props}
    >
      {Icon ? <Icon {...iconProps} /> : label}
    </Radio.Root>
  );
}

export { SegmentedControl, Segment };
