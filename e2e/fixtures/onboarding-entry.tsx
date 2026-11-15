import { createRoot } from "react-dom/client";
import { OnboardingFlow } from "@/features/onboarding/components/onboarding-flow";
import { ReadyStep } from "@/features/onboarding/components/ready-step";
import type { OnboardingSlug } from "@/features/onboarding/lib/steps";
import { fixture } from "./onboarding-convex";
import { navigation } from "./onboarding-navigation";

declare global {
  interface Window {
    onboardingFixture: typeof fixture & { pushes: string[] };
  }
}
export {};

window.onboardingFixture = Object.assign(fixture, { pushes: navigation.pushes });

const slug = (new URLSearchParams(location.search).get("slug") ?? "connect-x") as
  | OnboardingSlug
  | "ready";

createRoot(document.getElementById("root")!).render(
  slug === "ready" ? <ReadyStep /> : <OnboardingFlow slug={slug} />,
);
