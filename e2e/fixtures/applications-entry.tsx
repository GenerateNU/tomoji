import { createRoot } from "react-dom/client";
import { CreatorFeed } from "@/features/opportunities/components/creator-feed";
import { fixture } from "./applications-convex";

declare global {
  interface Window {
    applicationsFixture: typeof fixture;
  }
}

window.applicationsFixture = fixture;
createRoot(document.getElementById("root")!).render(<CreatorFeed />);
