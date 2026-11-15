import type { Id } from "@convex/_generated/dataModel";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { CompanyOpportunityModal } from "@/features/company-opportunities/modal/opportunity-modal";

/** Fixture preview of the company opportunity modal over a blank page. */
function Preview() {
  const [open, setOpen] = useState(true);
  return (
    <main className="min-h-screen bg-gray-25 p-8">
      <Button onClick={() => setOpen(true)}>Open opportunity</Button>
      <CompanyOpportunityModal
        opportunityId={"opportunity1" as Id<"opportunities">}
        open={open}
        onOpenChange={setOpen}
        onEdit={() => console.info("edit opportunity")}
      />
      <Toaster />
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Preview />);
