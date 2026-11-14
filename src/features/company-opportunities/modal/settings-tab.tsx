"use client";

import { api } from "@convex/_generated/api";
import type { Doc } from "@convex/_generated/dataModel";
import type { OpportunityView } from "@convex/models/opportunities";
import { useMutation } from "convex/react";
import { RiDeleteBinLine, RiPencilLine } from "@remixicon/react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Modal } from "@/components/modal";
import { Spinner } from "@/components/spinner";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { errorMessage, errorReason } from "@/lib/errors";
import { formatCompensation } from "@/lib/money";
import { formatModalDate } from "./lib/format";

const REASONS: Record<string, string> = {
  opportunity_not_open: "Only a live opportunity can be paused.",
  opportunity_not_paused: "Only a paused opportunity can be resumed.",
  campaign_closed: "The campaign has ended, so this opportunity can't change.",
  campaign_not_open: "The campaign isn't live, so this opportunity can't go live either.",
  invalid_deadline: "The deadline has passed. Edit the opportunity to set a new one first.",
  deliverables_required: "Add at least one assignment before publishing.",
  deadline_after_campaign_end: "The deadline is after the campaign ends. Edit the deadline first.",
  opportunity_not_removable: "Only a draft that no creator has joined can be deleted.",
  opportunity_has_workflow_history:
    "Creators have applied to or joined this opportunity, so it can't be deleted. Close it instead.",
};

function actionError(error: unknown): string {
  const reason = errorReason(error);
  return (reason && REASONS[reason]) || errorMessage(error);
}

type Action = "publish" | "pause" | "resume" | "close" | "remove";

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col items-start gap-3">
      <div className="flex items-center gap-2">
        <h3 className="text-body-lg font-medium text-gray-950">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-body-sm text-gray-500">{label}</dt>
      <dd className="text-body text-gray-950">{children}</dd>
    </div>
  );
}

/**
 * The Settings tab: the opportunity's requirements and terms, read-only (the
 * caller's editor changes them), and its lifecycle actions. Which actions show
 * follows the status rules in convex/models/opportunities.ts.
 */
export function SettingsTab({
  opportunity,
  campaignStatus,
  onEdit,
  onRemoved,
}: {
  opportunity: OpportunityView;
  campaignStatus: Doc<"campaigns">["status"];
  onEdit?: () => void;
  /** Called after the draft is deleted, so the modal can close. */
  onRemoved: () => void;
}) {
  const mutations = {
    publish: useMutation(api.opportunities.publish),
    pause: useMutation(api.opportunities.pause),
    resume: useMutation(api.opportunities.resume),
    close: useMutation(api.opportunities.close),
    remove: useMutation(api.opportunities.remove),
  };
  const [pending, setPending] = useState<Action | null>(null);
  const [confirming, setConfirming] = useState<"close" | "remove" | null>(null);
  const [error, setError] = useState<{ action: Action; message: string } | null>(null);

  async function run(action: Action) {
    setPending(action);
    setError(null);
    try {
      await mutations[action]({ opportunityId: opportunity._id });
      setConfirming(null);
      toast.success(
        {
          publish: "Opportunity published.",
          pause: "Opportunity paused.",
          resume: "Opportunity resumed.",
          close: "Opportunity closed.",
          remove: "Draft deleted.",
        }[action],
      );
      if (action === "remove") onRemoved();
    } catch (caught) {
      setError({ action, message: actionError(caught) });
    } finally {
      setPending(null);
    }
  }

  const button = (action: Action, label: string, variant: "primary" | "secondary-subtle") => (
    <Button
      size="sm"
      variant={variant}
      onClick={() => void run(action)}
      disabled={pending !== null}
    >
      {pending === action ? <Spinner size={16} label="Working" className="text-current" /> : null}
      {label}
    </Button>
  );
  const inlineError = (actions: Action[]) =>
    error && actions.includes(error.action) && confirming === null ? (
      <p role="alert" className="text-body-sm text-red-600">
        {error.message}
      </p>
    ) : null;

  const campaignOpen = campaignStatus !== "closed";
  const status = opportunity.status;

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <Section
        title="Requirements"
        action={
          onEdit ? (
            <Button
              variant="secondary-ghost"
              size="icon-sm"
              aria-label="Edit opportunity"
              onClick={onEdit}
            >
              <RiPencilLine size={16} aria-hidden />
            </Button>
          ) : undefined
        }
      >
        <p className="text-body whitespace-pre-line text-gray-950">
          {opportunity.contentRequirements}
        </p>
        <h4 className="pt-1 text-body font-medium text-gray-950">Review policy</h4>
        <p className="text-body whitespace-pre-line text-gray-950">{opportunity.reviewPolicy}</p>
      </Section>

      <dl className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3">
        <Fact label="Pay">{formatCompensation(opportunity)}</Fact>
        <Fact label="Creators">
          {opportunity.numFilledSlots} of {opportunity.maxSlots} slots filled
        </Fact>
        <Fact label="Deadline">{formatModalDate(opportunity.deadline)}</Fact>
        <Fact label="Joining">{opportunity.isGated ? "By application" : "Open to claim"}</Fact>
        <Fact label="Review">
          {opportunity.usesAiReviewDefault ? "AI review" : "Manual review"}
        </Fact>
      </dl>

      {status === "draft" && campaignOpen ? (
        <>
          <Separator />
          <Section title="Publish opportunity">
            <p className="text-body text-gray-500">
              Publishing makes this opportunity visible to creators. It needs at least one
              assignment.
            </p>
            {button("publish", "Publish opportunity", "primary")}
            {inlineError(["publish"])}
          </Section>
        </>
      ) : null}

      {(status === "open" || status === "paused") && campaignOpen ? (
        <>
          <Separator />
          <Section title={status === "open" ? "Pause opportunity" : "Resume opportunity"}>
            <p className="text-body text-gray-500">
              {status === "open"
                ? "Pausing hides this opportunity from new creators. Creators who already joined keep their assignments."
                : "Resuming makes this opportunity visible to new creators again."}
            </p>
            {status === "open"
              ? button("pause", "Pause opportunity", "secondary-subtle")
              : button("resume", "Resume opportunity", "secondary-subtle")}
            {inlineError(["pause", "resume"])}
          </Section>
        </>
      ) : null}

      {status !== "closed" ? (
        <>
          <Separator />
          <Section title={status === "draft" ? "Delete opportunity" : "Close opportunity"}>
            <p className="text-body text-gray-500">
              {status === "draft"
                ? "Deletes this draft and its assignments. A draft creators have applied to or joined can't be deleted."
                : "Closing ends this opportunity for good. Creators already on it keep their assignments, but nobody new can join."}
            </p>
            <Button
              size="sm"
              variant="destructive-subtle"
              icon={RiDeleteBinLine}
              disabled={pending !== null}
              onClick={() => setConfirming(status === "draft" ? "remove" : "close")}
            >
              {status === "draft" ? "Delete opportunity" : "Close opportunity"}
            </Button>
          </Section>
        </>
      ) : (
        <>
          <Separator />
          <p className="text-body text-gray-500">This opportunity is closed.</p>
        </>
      )}

      <Modal
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open && pending === null) {
            setConfirming(null);
            setError(null);
          }
        }}
        title={confirming === "remove" ? "Delete this draft?" : "Close this opportunity?"}
        // Nested dialogs skip the backdrop, so a shadow lifts it off the modal below.
        className="shadow-overlay sm:max-w-md"
        footer={
          <>
            <Button
              variant="secondary-ghost"
              onClick={() => setConfirming(null)}
              disabled={pending !== null}
            >
              Cancel
            </Button>
            <Button
              variant="destructive-subtle"
              onClick={() => confirming && void run(confirming)}
              disabled={pending !== null}
            >
              {pending !== null ? (
                <Spinner size={16} label="Working" className="text-current" />
              ) : null}
              {confirming === "remove" ? "Delete draft" : "Close opportunity"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-body text-gray-700">
            {confirming === "remove"
              ? `“${opportunity.title}” and its assignments will be deleted. This can't be undone.`
              : `Nobody new can join “${opportunity.title}”, and it can't be reopened. Creators already on it keep their assignments.`}
          </p>
          {error && error.action === confirming ? (
            <p role="alert" className="text-body-sm text-red-600">
              {error.message}
            </p>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}
