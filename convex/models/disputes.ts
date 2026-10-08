import { paginationOptsValidator, type PaginationResult } from "convex/server";
import { v, type Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { apiError } from "../lib/errors";
import { requireBoundedText } from "../lib/validation";
import schema from "../schema";
import {
  companyDisputeReasons,
  creatorDisputeReasons,
  type disputeReason,
} from "../schemas/disputes.schema";
import { userRole } from "../schemas/users.schema";
import { requireAssignment, type AssignmentViewer } from "./assignments";

const disputeDoc = schema.doc("disputes");

export const disputeDraft = disputeDoc.pick("assignmentId", "reason", "description");
export type DisputeDraft = Infer<typeof disputeDraft>;

/** `openedBy` is optional because creators never get user IDs (see `toCreatorView`). */
export const disputeView = disputeDoc
  .omit("openedBy")
  .extend({ openedBy: v.optional(v.id("users")) });
export type DisputeView = Infer<typeof disputeView>;

export const disputeListFilters = disputeDoc.pick("status").extend({
  openedByRole: v.optional(userRole),
  paginationOpts: paginationOptsValidator,
});
export type DisputeListFilters = Infer<typeof disputeListFilters>;

type DisputeReason = Infer<typeof disputeReason>;

const REASONS_BY_ROLE: Record<AssignmentViewer["role"], readonly DisputeReason[]> = {
  company: companyDisputeReasons,
  creator: creatorDisputeReasons,
  operator: [...companyDisputeReasons, ...creatorDisputeReasons],
};

const MAX_DESCRIPTION_LENGTH = 5000;

// An assignment has at most one approved submission, but a post can be shared
// to several platforms; this caps the read without expecting to reach it.
const MAX_EVIDENCE_POSTS = 20;

/**
 * Opens a dispute on any assignment the caller can see, whatever its status.
 * Errors are listed on the `disputes.create` route.
 */
export async function createDispute(
  ctx: MutationCtx,
  viewer: AssignmentViewer,
  openedBy: Id<"users">,
  draft: DisputeDraft,
): Promise<Id<"disputes">> {
  const assignment = await requireAssignment(ctx, viewer, draft.assignmentId);
  if (!REASONS_BY_ROLE[viewer.role].includes(draft.reason)) {
    throw apiError("invalid_state", { reason: "dispute_reason_not_allowed" });
  }
  const description = requireBoundedText(draft.description, "description", MAX_DESCRIPTION_LENGTH);

  return await ctx.db.insert("disputes", {
    assignmentId: assignment._id,
    companyId: assignment.companyId,
    creatorId: assignment.creatorId,
    campaignId: assignment.campaignId,
    openedBy,
    openedByRole: viewer.role,
    reason: draft.reason,
    description,
    ...(await evidenceOnFile(ctx, assignment._id)),
    status: "open",
  });
}

/**
 * The assignment's approved submission and its posts. Creating a submission is
 * refused once one is approved, so an approved one is always the newest.
 */
async function evidenceOnFile(
  ctx: MutationCtx,
  assignmentId: Id<"assignments">,
): Promise<Pick<Doc<"disputes">, "evidenceSubmissionIds" | "evidencePostIds">> {
  const latest = await ctx.db
    .query("submissions")
    .withIndex("by_assignmentId", (q) => q.eq("assignmentId", assignmentId))
    .order("desc")
    .first();
  if (latest?.status !== "approved") {
    return { evidenceSubmissionIds: [], evidencePostIds: [] };
  }
  const posts = await ctx.db
    .query("posts")
    .withIndex("by_submissionId", (q) => q.eq("submissionId", latest._id))
    .take(MAX_EVIDENCE_POSTS);
  return { evidenceSubmissionIds: [latest._id], evidencePostIds: posts.map((post) => post._id) };
}

/** One dispute, as the viewer may see it. */
export async function requireDispute(
  ctx: QueryCtx,
  viewer: AssignmentViewer,
  disputeId: Id<"disputes">,
): Promise<DisputeView> {
  const dispute = await ctx.db.get("disputes", disputeId);
  if (dispute === null || !canViewDispute(viewer, dispute)) {
    throw apiError("not_found", { resource: "dispute" });
  }
  return toDisputeView(viewer, dispute);
}

function canViewDispute(viewer: AssignmentViewer, dispute: Doc<"disputes">): boolean {
  switch (viewer.role) {
    case "operator":
      return true;
    case "creator":
      return dispute.creatorId === viewer.creatorId;
    case "company":
      return dispute.companyId === viewer.companyId;
  }
}

/**
 * One page of the caller's company's or creator's disputes in one status,
 * newest first, optionally only those opened by one side.
 *
 * @throws `forbidden` for operators, who will use the operator queue instead.
 */
export async function listDisputes(
  ctx: QueryCtx,
  viewer: AssignmentViewer,
  { status, openedByRole, paginationOpts }: DisputeListFilters,
): Promise<PaginationResult<DisputeView>> {
  const result = await disputesOf(ctx, viewer, status, openedByRole)
    .order("desc")
    .paginate(paginationOpts);
  return { ...result, page: result.page.map((dispute) => toDisputeView(viewer, dispute)) };
}

function disputesOf(
  ctx: QueryCtx,
  viewer: AssignmentViewer,
  status: DisputeListFilters["status"],
  openedByRole: DisputeListFilters["openedByRole"],
) {
  const disputes = ctx.db.query("disputes");
  switch (viewer.role) {
    case "company":
      return openedByRole === undefined
        ? disputes.withIndex("by_companyId_and_status", (q) =>
            q.eq("companyId", viewer.companyId).eq("status", status),
          )
        : disputes.withIndex("by_companyId_and_status_and_openedByRole", (q) =>
            q
              .eq("companyId", viewer.companyId)
              .eq("status", status)
              .eq("openedByRole", openedByRole),
          );
    case "creator":
      return openedByRole === undefined
        ? disputes.withIndex("by_creatorId_and_status", (q) =>
            q.eq("creatorId", viewer.creatorId).eq("status", status),
          )
        : disputes.withIndex("by_creatorId_and_status_and_openedByRole", (q) =>
            q
              .eq("creatorId", viewer.creatorId)
              .eq("status", status)
              .eq("openedByRole", openedByRole),
          );
    case "operator":
      // TODO(disputes): the operator queue across all companies.
      throw apiError("forbidden");
  }
}

function toDisputeView(viewer: AssignmentViewer, dispute: Doc<"disputes">): DisputeView {
  switch (viewer.role) {
    case "company":
    case "operator":
      return dispute;
    case "creator":
      return toCreatorView(dispute);
  }
}

/**
 * Copies an explicit list of fields rather than removing user IDs, so a field
 * added to the schema later stays hidden from creators until it's added here.
 */
function toCreatorView(dispute: Doc<"disputes">): DisputeView {
  return {
    _id: dispute._id,
    _creationTime: dispute._creationTime,
    assignmentId: dispute.assignmentId,
    companyId: dispute.companyId,
    creatorId: dispute.creatorId,
    campaignId: dispute.campaignId,
    openedByRole: dispute.openedByRole,
    reason: dispute.reason,
    description: dispute.description,
    evidenceSubmissionIds: dispute.evidenceSubmissionIds,
    evidencePostIds: dispute.evidencePostIds,
    status: dispute.status,
    resolution: dispute.resolution,
  };
}
