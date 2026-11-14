import { createRoot } from "react-dom/client";
import { AppShell } from "@/features/navigation/components/app-shell";
import { fixture } from "./settings-convex";

declare global {
  interface Window {
    shellFixture: typeof fixture;
  }
}

window.shellFixture = fixture;

createRoot(document.getElementById("root")!).render(
  <AppShell>
    <h1>Creator home</h1>
  </AppShell>,
);
