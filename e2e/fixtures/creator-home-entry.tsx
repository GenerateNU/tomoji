import { createRoot } from "react-dom/client";
import { AppShell } from "@/features/navigation/components/app-shell";
import { HomeView } from "@/features/users/components/home-view";
import { fixture } from "./settings-convex";

declare global {
  interface Window {
    shellFixture: typeof fixture;
  }
}

window.shellFixture = fixture;

// The same tree as app/(protected)/page.tsx.
createRoot(document.getElementById("root")!).render(
  <AppShell>
    <HomeView />
  </AppShell>,
);
