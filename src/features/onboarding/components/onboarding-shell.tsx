"use client";

import type { ReactNode } from "react";
import { Stepper } from "@/components/stepper";
import { cn } from "@/lib/utils";
import { ONBOARDING_LABELS, stepIndex, type OnboardingSlug } from "../lib/steps";

/**
 * The two-column frame every step shares: the form on the left under the
 * stepper, and whatever the step shows on the right. The right pane is hidden
 * below `lg`, where the form takes the full width.
 */
export function OnboardingShell({
  slug,
  children,
  aside,
  asideClassName,
}: {
  slug: OnboardingSlug;
  children: ReactNode;
  aside: ReactNode;
  /** The right pane's own background, which differs per step. */
  asideClassName?: string;
}) {
  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <div className="flex min-w-0 flex-1 flex-col bg-gray-0 px-6 py-10 sm:px-10">
        <Stepper
          steps={[...ONBOARDING_LABELS]}
          current={stepIndex(slug)}
          className="mx-auto w-full max-w-xl"
        />
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-md py-12">{children}</div>
        </div>
      </div>
      <div
        className={cn(
          "hidden min-w-0 flex-1 items-center justify-center p-10 lg:flex",
          asideClassName,
        )}
      >
        {aside}
      </div>
    </div>
  );
}

/** The heading and supporting line each step opens with. */
export function StepHeading({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-heading-lg font-medium text-gray-950">{title}</h1>
      <p className="text-body font-normal text-gray-500">{description}</p>
    </div>
  );
}
