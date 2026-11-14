import { createRoot } from "react-dom/client";
import { CreatorFeed } from "@/features/opportunities/components/creator-feed";

createRoot(document.getElementById("root")!).render(
  <main className="max-w-[1312px]">
    <CreatorFeed />
  </main>,
);
