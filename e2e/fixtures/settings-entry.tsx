import { createRoot } from "react-dom/client";
import SettingsPage from "@/app/(protected)/settings/page";
import { fixture } from "./settings-convex";

declare global {
  interface Window {
    settingsFixture: typeof fixture;
  }
}

window.settingsFixture = fixture;

createRoot(document.getElementById("root")!).render(
  <main className="flex min-h-screen flex-col">
    <SettingsPage />
  </main>,
);
