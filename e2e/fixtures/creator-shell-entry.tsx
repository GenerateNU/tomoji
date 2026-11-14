import { createRoot } from "react-dom/client";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { fixture } from "./settings-convex";

declare global {
  interface Window {
    shellFixture: typeof fixture;
  }
}

window.shellFixture = fixture;

createRoot(document.getElementById("root")!).render(
  <AppShell
    fallback={
      <nav aria-label="Fallback navigation">
        <Link href="/">Home</Link>
        <Link href="/settings">Settings</Link>
      </nav>
    }
  >
    <h1>Creator home</h1>
  </AppShell>,
);
