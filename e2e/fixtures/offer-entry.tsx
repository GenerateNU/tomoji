import { createRoot } from "react-dom/client";
import { useState } from "react";
import type { Id } from "@convex/_generated/dataModel";
import { AppShell } from "@/features/navigation/components/app-shell";
import { OfferModal } from "@/features/applications/components/offer-modal";
import { Button } from "@/components/ui/button";

function Preview() {
  const [open, setOpen] = useState(true);
  return (
    <AppShell>
      <section className="p-8">
        <p>Offer fixture preview · synthetic data · no account actions</p>
        <Button onClick={() => setOpen(true)}>Open offer</Button>
        <OfferModal
          applicationId={"application0" as Id<"applications">}
          open={open}
          onOpenChange={setOpen}
          onAccepted={() => {}}
        />
      </section>
    </AppShell>
  );
}
createRoot(document.getElementById("root")!).render(<Preview />);
