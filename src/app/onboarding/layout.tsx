import type { Metadata } from "next";

export const metadata: Metadata = { title: "Set up your profile · Tomoji" };

/** Onboarding runs without the app's navigation, so the step is the whole page. */
export default function OnboardingLayout({ children }: LayoutProps<"/onboarding">) {
  return <div className="flex flex-1 flex-col">{children}</div>;
}
