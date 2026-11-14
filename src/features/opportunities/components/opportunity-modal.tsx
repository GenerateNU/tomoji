"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useRef, useState, type FormEvent } from "react";
import { CountdownButton } from "@/components/countdown-button";
import { Modal } from "@/components/modal";
import { TextAreaField } from "@/components/text-area-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/errors";
import { feedAction } from "../lib/feed-status";
import type { FeedOpportunity } from "../lib/types";
import { CompanyAvatar } from "./company-avatar";
import { OpportunityDetails } from "./opportunity-details";

const NOTE_MAX_LENGTH = 200;
const NOTE_FORM_ID = "application-note-form";

function Heading({ opportunity }: { opportunity: FeedOpportunity }) {
  const applied = opportunity.application !== null;
  return (
    <span className="flex flex-col gap-4">
      <span className="flex items-center gap-2 text-body font-normal">
        <CompanyAvatar name={opportunity.companyName} size="xs" />
        {opportunity.companyName}
      </span>
      <span className="flex flex-wrap items-center gap-3">
        {opportunity.title}
        {(applied || opportunity.isGated) && (
          <Badge tone="primary" size="md">
            {applied ? "Applied" : "Application required"}
          </Badge>
        )}
      </span>
    </span>
  );
}

/**
 * The note a creator sends with an application. Submitting with an empty note
 * shows the error and focuses the field instead of calling the server.
 */
function ApplicationNote({
  opportunityId,
  onSubmitting,
  onSent,
}: {
  opportunityId: Id<"opportunities">;
  onSubmitting: (submitting: boolean) => void;
  onSent: () => void;
}) {
  const createApplication = useMutation(api.applications.create);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();
  const field = useRef<HTMLTextAreaElement>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (note.trim() === "") {
      setError("Write your application note to submit it");
      field.current?.focus();
      return;
    }
    onSubmitting(true);
    setError(undefined);
    try {
      await createApplication({ opportunityId, note: note.trim() });
      onSent();
    } catch (caught) {
      setError(
        errorMessage(caught, {
          conflict: "You've already applied to this opportunity.",
          invalid_state: "This opportunity isn't accepting applications anymore.",
          not_found: "This opportunity is no longer available.",
        }),
      );
    } finally {
      onSubmitting(false);
    }
  }

  return (
    <form id={NOTE_FORM_ID} onSubmit={submit} noValidate className="mt-6">
      <TextAreaField
        ref={field}
        label="Application note"
        required
        placeholder="Write a message..."
        maxLength={NOTE_MAX_LENGTH}
        value={note}
        onChange={(event) => {
          setNote(event.target.value);
          if (error) setError(undefined);
        }}
        error={error}
        rows={5}
      />
    </form>
  );
}

/**
 * The pop-up a card opens: the full brief, and the next step for this creator.
 * Applying needs a note; once sent, a confirmation closes itself.
 */
export function OpportunityModal({
  opportunityId,
  open,
  onOpenChange,
}: {
  opportunityId: Id<"opportunities">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const opportunity = useQuery(api.opportunities.get, open ? { opportunityId } : "skip");
  const [step, setStep] = useState<"details" | "sent">("details");
  const [submitting, setSubmitting] = useState(false);

  function changeOpen(next: boolean) {
    onOpenChange(next);
    // Reopening starts from the brief again.
    if (!next) setStep("details");
  }

  if (opportunity === undefined) {
    return (
      <Modal
        open={open}
        onOpenChange={changeOpen}
        title="Loading opportunity…"
        className="sm:max-w-2xl"
      >
        <div aria-busy="true" className="flex flex-col gap-4">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </Modal>
    );
  }
  // Company users and operators get the full document; this pop-up is for creators.
  if (!("companyName" in opportunity)) {
    return (
      <Modal open={open} onOpenChange={changeOpen} title="Only creators can open this view." />
    );
  }

  if (step === "sent") {
    return (
      <Modal
        open={open}
        onOpenChange={changeOpen}
        title="Application successfully sent!"
        titleSize="lg"
        className="sm:max-w-[530px]"
        footer={<CountdownButton className="w-60" onComplete={() => changeOpen(false)} />}
      >
        <p className="text-body text-gray-700">
          Thanks for applying! {opportunity.companyName} has received your application and will be
          in touch with you soon.
        </p>
      </Modal>
    );
  }

  const canApply = feedAction(opportunity).kind === "apply";
  return (
    <Modal
      open={open}
      onOpenChange={changeOpen}
      titleSize="lg"
      title={<Heading opportunity={opportunity} />}
      className="sm:max-w-2xl"
      footer={
        canApply && (
          <>
            <Button variant="secondary-subtle" onClick={() => changeOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form={NOTE_FORM_ID} disabled={submitting}>
              {submitting ? "Applying…" : "Apply"}
            </Button>
          </>
        )
      }
    >
      <OpportunityDetails opportunity={opportunity} />
      {canApply && (
        <ApplicationNote
          opportunityId={opportunity._id}
          onSubmitting={setSubmitting}
          onSent={() => setStep("sent")}
        />
      )}
    </Modal>
  );
}
