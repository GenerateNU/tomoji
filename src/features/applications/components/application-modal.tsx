"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { CreatorOpportunity } from "@convex/models/opportunities";
import { useMutation, useQuery } from "convex/react";
import { BanknoteIcon, ClockIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { formatCompensation, formatDeadline } from "@/features/opportunities/lib/format";
import { errorMessage } from "@/lib/errors";

//check is FE only
const NOTE_MAX_LENGTH = 200;

type ApplicationModalProps = {
  opportunityId: Id<"opportunities">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};


export function ApplicationModal({ opportunityId, open, onOpenChange }: ApplicationModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto p-10 sm:max-w-2xl">
        {/*If a creator shuts and opens it it goes back to the start - is this the desired behavior? */}
        {open && <ApplicationFlow key={opportunityId} opportunityId={opportunityId} />}
      </DialogContent>
    </Dialog>
  );
}

function ApplicationFlow({ opportunityId }: { opportunityId: Id<"opportunities"> }) {
  const opportunity = useQuery(api.opportunities.get, { opportunityId });
  const [step, setStep] = useState<"details" | "note" | "submitted">("details");

  if (opportunity === undefined) {
    return <DialogTitle className="text-muted-foreground">Loading…</DialogTitle>;
  }
  // Company users and operators get the full document; this flow is for creators.
  if (!("companyName" in opportunity)) {
    return <DialogTitle>Only creators can apply to opportunities.</DialogTitle>;
  }

  if (step === "submitted") return <Submitted />;
  if (step === "note") {
    return (
      <NoteForm
        opportunityId={opportunity._id}
        onBack={() => setStep("details")}
        onSubmitted={() => setStep("submitted")}
      />
    );
  }
  return <Details opportunity={opportunity} onApply={() => setStep("note")} />;
}

function Details({
  opportunity,
  onApply,
}: {
  opportunity: CreatorOpportunity;
  onApply: () => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        {/* Company logos aren't stored yet; a grey square stands in, as in the Figma. */}
        <div className="size-10 rounded-lg bg-muted" />
        <span>{opportunity.companyName}</span>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <DialogTitle className="text-2xl font-semibold">{opportunity.title}</DialogTitle>
          {opportunity.isGated && <Badge variant="secondary">Application required</Badge>}
        </div>
        <DialogDescription className="text-foreground">{opportunity.description}</DialogDescription>
        <p className="flex items-center gap-2 text-muted-foreground">
          <ClockIcon className="size-4" aria-hidden />
          Apply by {formatDeadline(opportunity.deadline)}
        </p>
        <p className="flex items-center gap-2 text-muted-foreground">
          <BanknoteIcon className="size-4" aria-hidden />
          {formatCompensation(opportunity)}
        </p>
      </div>

      <Button
        size="lg"
        className="w-fit px-12"
        onClick={onApply}
        disabled={!opportunity.isGated || opportunity.status !== "open"}
      >
        Apply
      </Button>

      <Separator />

      <div className="grid grid-cols-2 gap-6">
        <SkillTags niches={opportunity.niches} />
        {/* HARDCODED: opportunities don't store years of experience yet. */}
        <Section label="Years of experience">
          <Tags tags={[">1 year"]} />
        </Section>
      </div>
      {/* HARDCODED: opportunities don't store a content cadence yet. */}
      <Section label="Content">
        <Tags tags={["3–5 videos/wk"]} />
      </Section>

      {/* Not matching from the Figma, matching from the database - taking styling from Figma.*/}
      <TextSection label="Who they're looking for" text={opportunity.targetApplicant} />
      <TextSection label="Content requirements" text={opportunity.contentRequirements} />
      <TextSection label="Disclosure requirements" text={opportunity.disclosureRequirements} />
      <TextSection label="Prohibited claims" text={opportunity.prohibitedClaims} />
      <TextSection label="Usage rights" text={opportunity.usageRights} />
    </div>
  );
}

function NoteForm({
  opportunityId,
  onBack,
  onSubmitted,
}: {
  opportunityId: Id<"opportunities">;
  onBack: () => void;
  onSubmitted: () => void;
}) {
  const createApplication = useMutation(api.applications.create);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await createApplication({ opportunityId, note: note.trim() });
      onSubmitted();
    } catch (caught) {
      setError(
        errorMessage(caught, {
          conflict: "You've already applied to this opportunity.",
          invalid_state: "This opportunity isn't accepting applications anymore.",
          not_found: "This opportunity is no longer available.",
        }),
      );
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <DialogTitle>
        <Label htmlFor="application-note" className="gap-0 text-base">
          Note<span className="text-destructive">*</span>
        </Label>
      </DialogTitle>
      <DialogDescription className="text-foreground">
        To submit this application, you must attach a note for the team to review.
      </DialogDescription>
      <div className="relative">
        <Textarea
          id="application-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Write a message…"
          maxLength={NOTE_MAX_LENGTH}
          required
          className="min-h-28 resize-none pb-8"
        />
        <span className="absolute right-3 bottom-2 text-muted-foreground">
          {note.length}/{NOTE_MAX_LENGTH}
        </span>
      </div>
      {error && <p className="text-destructive">{error}</p>}
      <Button
        type="submit"
        size="lg"
        className="w-full"
        disabled={submitting || note.trim() === ""}
      >
        {submitting ? "Applying…" : "Apply"}
      </Button>
      <Button type="button" variant="link" onClick={onBack} disabled={submitting}>
        Back
      </Button>
    </form>
  );
}

// Added this confirmation, but it wasn't in the Figma designs.
function Submitted() {
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <DialogTitle className="text-2xl font-semibold">Application sent</DialogTitle>
      <DialogDescription>We&apos;ll notify you when the company responds.</DialogDescription>
      <DialogClose render={<Button size="lg" className="px-12" />}>Done</DialogClose>
    </div>
  );
}

/** The opportunity's niches, shown as skills. Labels come from the niche list. */
function SkillTags({ niches }: { niches: string[] }) {
  const allNiches = useQuery(api.niches.list);
  const labels = new Map<string, string>(allNiches?.map((niche) => [niche.name, niche.label]));
  return (
    <Section label="Skills">
      <Tags tags={niches.map((name) => labels.get(name) ?? name)} />
    </Section>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-xs text-muted-foreground">{label}</h3>
      {children}
    </div>
  );
}

function Tags({ tags }: { tags: string[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {tags.map((tag) => (
        <Badge key={tag} variant="secondary">
          {tag}
        </Badge>
      ))}
    </div>
  );
}

function TextSection({ label, text }: { label: string; text: string }) {
  if (text.trim() === "") return null;
  return (
    <Section label={label}>
      <p className="whitespace-pre-line">{text}</p>
    </Section>
  );
}
