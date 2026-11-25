import { createRoot } from "react-dom/client";
import { CreatorFeed } from "@/features/opportunities/components/creator-feed";

createRoot(document.getElementById("root")!).render(
  <main className="max-w-[1312px]">
    {/* The page passes `?opportunity=<id>` in; here the fixture reads it itself. */}
    <CreatorFeed
      linkedOpportunityId={new URLSearchParams(location.search).get("opportunity") ?? undefined}
    />
  </main>,
);
