import type { ComponentProps } from "react";
import { RiCheckboxCircleLine } from "@remixicon/react";
import { iconProps } from "@/lib/icons";
import { cn } from "@/lib/utils";

type StepperProps = ComponentProps<"ol"> & {
  /** Step labels, in order. */
  steps: string[];
  /** Index of the step the user is on. Earlier steps show as complete. */
  current: number;
};

/**
 * Figma "Progress Bar (Stepper)": one bar per step, filled blue through the current
 * one. Moving to a step fills its bar left to right over 300ms.
 */
export function Stepper({ steps, current, className, ...props }: StepperProps) {
  return (
    <ol className={cn("flex w-full gap-1.5", className)} {...props}>
      {steps.map((label, index) => {
        const state = index < current ? "complete" : index === current ? "current" : "upcoming";
        return (
          <li
            key={label}
            data-state={state}
            aria-current={state === "current" ? "step" : undefined}
            className="group/step flex min-w-0 flex-1 flex-col gap-2"
          >
            {/* A gray track with a blue fill that grows left to right as the step is
                reached (and shrinks back when stepping back). */}
            <span aria-hidden className="h-1.5 overflow-hidden rounded-xs bg-gray-100">
              <span className="block h-full origin-left scale-x-100 bg-blue-primary transition-transform duration-300 ease-out group-data-[state=upcoming]/step:scale-x-0 motion-reduce:transition-none" />
            </span>
            <span className="flex min-w-0 items-center gap-1 text-body-xs font-normal text-gray-700 group-data-[state=current]/step:font-medium group-data-[state=current]/step:text-gray-950 group-data-[state=upcoming]/step:text-gray-400">
              {state === "complete" && (
                <RiCheckboxCircleLine {...iconProps} size={14} className="shrink-0" />
              )}
              <span className="truncate">{label}</span>
              {state === "complete" && <span className="sr-only"> (complete)</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
