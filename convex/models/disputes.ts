import { paginationOptsValidator, type PaginationResult } from "convex/server";
import { v, type Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { apiError } from "../lib/errors";
import { requireBoundedText } from "../lib/validation";
import {
  companyDisputeReasons,
  creatorDisputeReasons,
  disputeOutcome,
  disputeReason,
  disputeShapes,
  disputeStatus,
} from "../schemas/disputes.schema";
import { userRole } from "../schemas/users.schema";
import { requireAssignment, type AssignmentViewer } from "./assignments";
import { getLatestSubmission } from "./submissions";

export const disputeDraft = v.object({
  assignmentId: v.id("assignments"),
  reason: disputeReason,
  description: v.string(),
});
export type DisputeDraft = Infer<typeof disputeDraft>;

/** An operator's ruling on an open dispute. */
export const disputeResolution = v.object({
  outcome: disputeOutcome,
  decision: v.string(),
});
export type DisputeResolution = Infer<typeof disputeResolution>;

/** User IDs are optional because creators never get them (see `toCreatorView`). */
export const disputeView = v.union(
  ...disputeShapes(v.optional(v.id("users")), v.optional(v.id("users")), {
    _id: v.id("disputes"),
    _creationTime: v.number(),
  }),
);
export type DisputeView = Infer<typeof disputeView>;

export const disputeListFilters = v.object({
  status: disputeStatus,
  openedByRole: v.optional(userRole),
  paginationOpts: paginationOptsValidator,
});
export type DisputeListFilters = Infer<typeof disputeListFilters>;

export type ResolvedDispute = Extract<Doc<"disputes">, { status: "resolved" }>;

type DisputeReason = Infer<typeof disputeReason>;

const REASONS_BY_ROLE: Record<AssignmentViewer["role"], readonly DisputeReason[]> = {
  company: companyDisputeReasons,
  creator: creatorDisputeReasons,
  operator: [...companyDisputeReasons, ...creatorDisputeReasons],
};

const MAX_LENGTH = {
  description: 5000,
  decision: 2000,
} as const;

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
  const description = requireBoundedText(draft.description, "description", MAX_LENGTH.description);

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
  const latest = await getLatestSubmission(ctx, assignmentId);
  if (latest?.status !== "approved") {
    return { evidenceSubmissionIds: [], evidencePostIds: [] };
  }
  const posts = await ctx.db
    .query("posts")
    .withIndex("by_submissionId", (q) => q.eq("submissionId", latest._id))
    .take(MAX_EVIDENCE_POSTS);
  return { evidenceSubmissionIds: [latest._id], evidencePostIds: posts.map((post) => post._id) };
}

/** Closes an open dispute. Errors are listed on the `disputes.resolve` route. */
export async function resolveDispute(
  ctx: MutationCtx,
  resolvedBy: Id<"users">,
  disputeId: Id<"disputes">,
  resolution: DisputeResolution,
): Promise<ResolvedDispute> {
  const dispute = await ctx.db.get("disputes", disputeId);
  if (dispute === null) throw apiError("not_found", { resource: "dispute" });
  if (dispute.status !== "open") {
    throw apiError("invalid_state", { reason: "already_resolved" });
  }

  const resolved: ResolvedDispute = {
    ...dispute,
    status: "resolved",
    resolvedBy,
    resolvedAt: Date.now(),
    outcome: resolution.outcome,
    decision: requireBoundedText(resolution.decision, "decision", MAX_LENGTH.decision),
  };
  await ctx.db.replace("disputes", disputeId, resolved);
  return resolved;
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
 * One page of disputes in one status, optionally only those one side opened:
 * the caller's company's or creator's, or every company's for operators.
 * Resolved disputes come most recently closed first. Open ones come newest
 * first, except for operators, who work the queue oldest first.
 */
export async function listDisputes(
  ctx: QueryCtx,
  viewer: AssignmentViewer,
  { status, openedByRole, paginationOpts }: DisputeListFilters,
): Promise<PaginationResult<DisputeView>> {
  const order = viewer.role === "operator" && status === "open" ? "asc" : "desc";
  const result = await disputesOf(ctx, viewer, status, openedByRole)
    .order(order)
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
        ? disputes.withIndex("by_companyId_and_status_and_resolvedAt", (q) =>
            q.eq("companyId", viewer.companyId).eq("status", status),
          )
        : disputes.withIndex("by_companyId_and_status_and_openedByRole_and_resolvedAt", (q) =>
            q
              .eq("companyId", viewer.companyId)
              .eq("status", status)
              .eq("openedByRole", openedByRole),
          );
    case "creator":
      return openedByRole === undefined
        ? disputes.withIndex("by_creatorId_and_status_and_resolvedAt", (q) =>
            q.eq("creatorId", viewer.creatorId).eq("status", status),
          )
        : disputes.withIndex("by_creatorId_and_status_and_openedByRole_and_resolvedAt", (q) =>
            q
              .eq("creatorId", viewer.creatorId)
              .eq("status", status)
              .eq("openedByRole", openedByRole),
          );
    case "operator":
      return openedByRole === undefined
        ? disputes.withIndex("by_status_and_resolvedAt", (q) => q.eq("status", status))
        : disputes.withIndex("by_status_and_openedByRole_and_resolvedAt", (q) =>
            q.eq("status", status).eq("openedByRole", openedByRole),
          );
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
  const opened = {
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
  };
  if (dispute.status === "open") return { ...opened, status: "open" };
  return {
    ...opened,
    status: "resolved",
    resolvedAt: dispute.resolvedAt,
    outcome: dispute.outcome,
    decision: dispute.decision,
  };
}
