import { createRoot } from "react-dom/client";
import PostsPage from "@/app/(protected)/posts/page";
import { AppShell } from "@/features/navigation/components/app-shell";
import { fixture } from "./posts-convex";

declare global {
  interface Window {
    postsFixture: typeof fixture;
  }
}

window.postsFixture = fixture;

createRoot(document.getElementById("root")!).render(
  <AppShell>
    <PostsPage />
  </AppShell>,
);
