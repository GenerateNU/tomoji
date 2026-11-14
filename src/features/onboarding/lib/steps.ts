/** The onboarding steps, in order. The labels are also the stepper's labels. */
export const ONBOARDING_STEPS = [
  { slug: "connect-x", label: "Connect X" },
  { slug: "basic-info", label: "Basic info" },
  { slug: "content", label: "Content" },
  { slug: "portfolio", label: "Portfolio" },
] as const;

export type OnboardingSlug = (typeof ONBOARDING_STEPS)[number]["slug"];

export const ONBOARDING_LABELS = ONBOARDING_STEPS.map((step) => step.label);

export function stepIndex(slug: OnboardingSlug): number {
  return ONBOARDING_STEPS.findIndex((step) => step.slug === slug);
}

export function onboardingPath(slug: OnboardingSlug): string {
  return `/onboarding/${slug}`;
}

/** The step after `slug`, or `/onboarding/ready` once the last one is done. */
export function nextPath(slug: OnboardingSlug): string {
  const next = ONBOARDING_STEPS[stepIndex(slug) + 1];
  return next === undefined ? "/onboarding/ready" : onboardingPath(next.slug);
}

/** The step before `slug`, or null on the first one. */
export function previousPath(slug: OnboardingSlug): string | null {
  const previous = ONBOARDING_STEPS[stepIndex(slug) - 1];
  return previous === undefined ? null : onboardingPath(previous.slug);
}
