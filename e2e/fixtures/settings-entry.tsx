import { createRoot } from "react-dom/client";
import SettingsPage from "@/app/(protected)/settings/page";
import { fixture } from "./settings-convex";
import { authFixture } from "./settings-auth";
import { AppShell } from "@/components/app-shell";

declare global {
  interface Window {
    settingsFixture: typeof fixture;
    settingsAuthFixture: typeof authFixture;
  }
}

window.settingsFixture = fixture;
window.settingsAuthFixture = authFixture;

createRoot(document.getElementById("root")!).render(
  <AppShell fallback={<nav aria-label="Fallback navigation">Ohani</nav>}>
    <SettingsPage />
  </AppShell>,
);
