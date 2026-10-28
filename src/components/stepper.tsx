import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

type StepperProps = ComponentProps<"ol"> & {
  /** Step labels, in order. */
  steps: string[];
  /** Index of the step the user is on. Earlier steps show as complete. */
  current: number;
};

/** Figma "Progress Bar (Stepper)": one bar per step, filled through the current one. */
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
            <span
              aria-hidden
              className="h-1.5 rounded-full bg-primary group-data-[state=upcoming]/step:bg-neutral-200"
            />
            <span className="truncate text-body-xs text-foreground group-data-[state=current]/step:font-medium group-data-[state=upcoming]/step:text-neutral-400">
              {label}
              {state === "complete" && <span className="sr-only"> (complete)</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
