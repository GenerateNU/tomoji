import { v, type Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { requireActiveAssignment } from "./assignments";
import { optionalNonBlank, requireNonBlank } from "../lib/validation";
import { notifyCreator } from "./notifications";

/** A review decision. A change request needs a note; an approval's is optional. */
export const submissionReview = v.union(
  v.object({ status: v.literal("approved"), reviewNote: v.optional(v.string()) }),
  v.object({ status: v.literal("changesRequested"), reviewNote: v.string() }),
);
export type SubmissionReview = Infer<typeof submissionReview>;

type Reviewer =
  | { reviewerType: "ai" }
  | { reviewerType: "companyUser"; reviewedBy: Id<"companyUsers"> };

/** Commits either initial reviewer's decision and notification together; callers authorize first. */
export async function recordSubmissionReview<R extends Reviewer>(
  ctx: MutationCtx,
  submission: Extract<Doc<"submissions">, { status: "pending" }>,
  assignment: Doc<"assignments">,
  review: SubmissionReview,
  reviewer: R,
) {
  requireActiveAssignment(assignment);
  const outcome =
    review.status === "changesRequested"
      ? {
          status: review.status,
          reviewNote: requireNonBlank(review.reviewNote, "reviewNote", 2000),
        }
      : {
          status: review.status,
          reviewNote: optionalNonBlank(review.reviewNote, "reviewNote", 2000),
        };
  const patch = { ...outcome, ...reviewer, reviewedAt: Date.now() };
  await ctx.db.patch("submissions", submission._id, patch);
  const opportunity = await ctx.db.get("opportunities", assignment.opportunityId);
  if (opportunity) {
    const target = {
      kind: "submission" as const,
      submissionId: submission._id,
      assignmentId: assignment._id,
    };
    await notifyCreator(
      ctx,
      assignment.creatorId,
      outcome.status === "approved"
        ? {
            type: "submissionApproved",
            title: `Your draft for ${opportunity.title} was approved`,
            target,
          }
        : {
            type: "submissionChangesRequested",
            title: `Changes requested on your draft for ${opportunity.title}`,
            body: outcome.reviewNote,
            target,
          },
    );
  }
  return { ...submission, ...patch };
}
