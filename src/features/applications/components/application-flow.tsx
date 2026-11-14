"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { useState } from "react";
import { DialogTitle } from "@/components/ui/dialog";
import { ApplicationNoteForm } from "./application-note-form";
import { ApplicationSent } from "./application-sent";
import { OpportunityBrief } from "./opportunity-brief";

/** Walks a creator from the brief, through the note, to confirmation. */
export function ApplicationFlow({ opportunityId }: { opportunityId: Id<"opportunities"> }) {
  const opportunity = useQuery(api.opportunities.get, { opportunityId });
  const [step, setStep] = useState<"details" | "note" | "submitted">("details");

  if (opportunity === undefined) {
    return <DialogTitle className="text-muted-foreground">Loading…</DialogTitle>;
  }
  // Company users and operators get the full document; this flow is for creators.
  if (!("companyName" in opportunity)) {
    return <DialogTitle>Only creators can apply to opportunities.</DialogTitle>;
  }

  if (step === "submitted") return <ApplicationSent />;
  if (step === "note") {
    return (
      <ApplicationNoteForm
        opportunityId={opportunity._id}
        onBack={() => setStep("details")}
        onSubmitted={() => setStep("submitted")}
      />
    );
  }
  return <OpportunityBrief opportunity={opportunity} onApply={() => setStep("note")} />;
}
