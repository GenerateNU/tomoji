import { createRoot } from "react-dom/client";
import { CreatorApplications } from "@/features/applications/components/creator-applications";

createRoot(document.getElementById("root")!).render(
  <main className="mx-auto w-full max-w-6xl px-4 py-6">
    {/* The page passes `?application=<id>` in; here the fixture reads it itself. */}
    <CreatorApplications
      linkedApplicationId={new URLSearchParams(location.search).get("application") ?? undefined}
    />
  </main>,
);
