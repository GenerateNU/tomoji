import type { Doc } from "@convex/_generated/dataModel";
import { errorMessage, errorReason } from "@/lib/errors";

/** Most assignments (backend: deliverables) one opportunity can have; MAX_DELIVERABLES on the server. */
export const MAX_DELIVERABLES = 20;

type RuleInput = {
  opportunityStatus: Doc<"opportunities">["status"];
  campaignStatus: Doc<"campaigns">["status"];
  deadline: number;
  /** Whether any creator has ever been assigned; undefined while that's loading. */
  hasAssignments: boolean | undefined;
  /** How many deliverables the opportunity has now. */
  count: number;
  now: number;
};

export type DeliverableRules = {
  canAdd: boolean;
  canChange: boolean;
  canRemove: boolean;
  addReason?: string;
  changeReason?: string;
  removeReason?: string;
};

/**
 * What the company can do with an opportunity's deliverables, mirroring the
 * checks in convex/models/deliverables.ts so the UI can explain a disabled
 * action instead of letting the server refuse it. The server still decides.
 */
export function deliverableRules(input: RuleInput): DeliverableRules {
  const frozen =
    input.opportunityStatus === "closed" || input.campaignStatus === "closed"
      ? "This opportunity is closed, so its assignments can't change."
      : input.opportunityStatus !== "draft" && input.deadline <= input.now
        ? "This opportunity's deadline has passed, so its assignments can't change."
        : undefined;
  if (frozen) {
    return {
      canAdd: false,
      canChange: false,
      canRemove: false,
      addReason: frozen,
      changeReason: frozen,
      removeReason: frozen,
    };
  }

  const rules: DeliverableRules = { canAdd: true, canChange: true, canRemove: true };
  if (input.count >= MAX_DELIVERABLES) {
    rules.canAdd = false;
    rules.addReason = `An opportunity can have up to ${MAX_DELIVERABLES} assignments.`;
  }
  if (input.hasAssignments !== false) {
    const reason =
      input.hasAssignments === undefined
        ? "Checking whether creators have joined…"
        : "Creators have joined this opportunity, so its assignments are locked. You can still add new ones.";
    return {
      ...rules,
      canChange: false,
      canRemove: false,
      changeReason: reason,
      removeReason: reason,
    };
  }
  if (input.opportunityStatus !== "draft" && input.count <= 1) {
    rules.canRemove = false;
    rules.removeReason = "A published opportunity needs at least one assignment.";
  }
  return rules;
}

const REASONS: Record<string, string> = {
  opportunity_has_assignments:
    "A creator has joined this opportunity, so its assignments are locked.",
  opportunity_not_editable: "This opportunity is closed, so its assignments can't change.",
  opportunity_expired: "This opportunity's deadline has passed, so its assignments can't change.",
  too_many_deliverables: `An opportunity can have up to ${MAX_DELIVERABLES} assignments.`,
  last_deliverable: "A published opportunity needs at least one assignment.",
  ai_review_criteria_required: "AI review is on for this opportunity, so add review criteria.",
  too_many_review_criteria: "Use at most 20 review criteria.",
  duplicate_review_criterion: "The same review criterion is listed twice.",
  deliverableTitle_blank: "Add a title.",
  deliverableTitle_too_long: "Shorten the title to 200 characters.",
  deliverableDescription_blank: "Add the content requirements.",
  deliverableDescription_too_long: "Shorten the content requirements to 5,000 characters.",
};

/** Copy for a failed deliverable create, update, or remove. */
export function deliverableErrorMessage(error: unknown): string {
  const reason = errorReason(error);
  if (reason && reason in REASONS) return REASONS[reason];
  return errorMessage(error, { not_found: "This assignment no longer exists." });
}
