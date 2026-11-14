import { createRoot } from "react-dom/client";
import SettingsPage from "@/app/(protected)/settings/page";
import { fixture } from "./settings-convex";
import { authFixture } from "./settings-auth";
import { AppShell } from "@/features/navigation/components/app-shell";

declare global {
  interface Window {
    settingsFixture: typeof fixture;
    settingsAuthFixture: typeof authFixture;
  }
}

window.settingsFixture = fixture;
window.settingsAuthFixture = authFixture;

createRoot(document.getElementById("root")!).render(
  <AppShell>
    <SettingsPage />
  </AppShell>,
);
