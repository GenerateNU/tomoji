import { AppShell } from "@/features/navigation/components/app-shell";
import { OnboardingGate } from "@/features/onboarding/components/onboarding-gate";

/** Wraps every signed-in page in the sidebar shell, which renders the page's `<main>`. */
export default function ProtectedLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      {/* Renders nothing; it sends a creator who hasn't finished onboarding
          into it from any authenticated page. */}
      <OnboardingGate />
      <AppShell>{children}</AppShell>
    </>
  );
}
