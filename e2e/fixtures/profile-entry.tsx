import { createRoot } from "react-dom/client";
import Link from "next/link";
import ProfilePage from "@/app/(protected)/profile/page";
import SettingsPage from "@/app/(protected)/settings/page";
import { ProfileNavLink } from "@/features/profile/components/profile-nav-link";
import { fixture } from "./settings-convex";

declare global {
  interface Window {
    profileFixture: typeof fixture;
  }
}

window.profileFixture = fixture;
const navOnly = new URLSearchParams(location.search).has("navOnly");

createRoot(document.getElementById("root")!).render(
  <>
    <nav aria-label="Main navigation" className="border-b px-4 py-3 sm:px-6">
      {navOnly && <Link href="/">Home</Link>}
      <ProfileNavLink />
      {navOnly && <Link href="/settings">Settings</Link>}
    </nav>
    <main className="flex min-h-screen flex-col">
      {navOnly ? (
        <h1>Home</h1>
      ) : location.pathname === "/settings" ? (
        <SettingsPage />
      ) : (
        <ProfilePage />
      )}
    </main>
  </>,
);
