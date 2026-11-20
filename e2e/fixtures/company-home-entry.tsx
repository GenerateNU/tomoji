import { createRoot } from "react-dom/client";
import { AppShell } from "@/features/navigation/components/app-shell";
import { HomeView } from "@/features/users/components/home-view";
import { fixture } from "./company-home-convex";

declare global {
  interface Window {
    companyHomeFixture: typeof fixture;
  }
}
window.companyHomeFixture = fixture;
createRoot(document.getElementById("root")!).render(
  <AppShell>
    <HomeView />
  </AppShell>,
);
