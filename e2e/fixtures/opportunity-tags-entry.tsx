import { createRoot } from "react-dom/client";
import { OpportunityTags } from "@/features/applications/components/opportunity-tags";

createRoot(document.getElementById("root")!).render(
  <main className="grid max-w-2xl gap-6 p-6 sm:grid-cols-2">
    <OpportunityTags
      niches={["data-analytics-business-intelligence", "databases"]}
      skills={["identity-access-management", "typescript"]}
    />
  </main>,
);
