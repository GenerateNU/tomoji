import { createRoot } from "react-dom/client";
import { AppShell } from "@/features/navigation/components/app-shell";
import { CreatorHome } from "@/features/users/components/creator-home";
import { fixture } from "./settings-convex";

declare global {
  interface Window {
    shellFixture: typeof fixture;
  }
}

window.shellFixture = fixture;

createRoot(document.getElementById("root")!).render(
  <AppShell>
    {/* The same wrapper as app/(protected)/page.tsx. */}
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-10">
      <CreatorHome />
    </div>
  </AppShell>,
);
