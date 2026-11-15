import { redirect } from "next/navigation";

/** Onboarding always starts at the first step. */
export default function OnboardingPage() {
  redirect("/onboarding/connect-x");
}
