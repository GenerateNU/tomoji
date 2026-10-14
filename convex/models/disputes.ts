import { paginationOptsValidator, type PaginationResult } from "convex/server";
import { v, type Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { apiError } from "../lib/errors";
import { optionalNonBlank, requireNonBlank } from "../lib/validation";
import {
  companyDisputeReasons,
  creatorDisputeReasons,
  disputeOutcome,
  disputeReason,
  disputeShapes,
  disputeStatus,
  operatorDisputeOutcome,
} from "../schemas/disputes.schema";
import { userRole } from "../schemas/users.schema";
import { canViewResource } from "../lib/authz";
import { requireAssignment, type AssignmentViewer } from "./assignments";

export const disputeCreate = v.object({
  assignmentId: v.id("assignments"),
  postId: v.optional(v.id("posts")),
  reason: disputeReason,
  customReason: v.optional(v.string()),
  description: v.string(),
});
export type DisputeCreate = Infer<typeof disputeCreate>;

/** How the opener's side (or Tomoji) closes an open dispute. */
export const disputeResolution = v.object({
  outcome: disputeOutcome,
  note: v.optional(v.string()),
});
export type DisputeResolution = Infer<typeof disputeResolution>;

/** Tomoji's ruling over a result the opener's side reported. The reason is required. */
export const disputeOverride = v.object({
  outcome: operatorDisputeOutcome,
  note: v.string(),
});
export type DisputeOverride = Infer<typeof disputeOverride>;

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
  customReason: 200,
  description: 5000,
  note: 2000,
} as const;

/**
 * Opens a dispute on any assignment the caller can see, whatever its status.
 * Errors are listed on the `disputes.create` route.
 */
export async function createDispute(
  ctx: MutationCtx,
  viewer: AssignmentViewer,
  openedBy: Id<"users">,
  input: DisputeCreate,
): Promise<Id<"disputes">> {
  const assignment = await requireAssignment(ctx, viewer, input.assignmentId);
  if (!REASONS_BY_ROLE[viewer.role].includes(input.reason)) {
    throw apiError("invalid_state", { reason: "dispute_reason_not_allowed" });
  }
  const customReason = requireCustomReason(input);
  if (input.postId !== undefined) {
    await requirePostOnAssignment(ctx, input.postId, assignment._id);
  }
  const description = requireNonBlank(input.description, "description", MAX_LENGTH.description);

  return await ctx.db.insert("disputes", {
    assignmentId: assignment._id,
    companyId: assignment.companyId,
    creatorId: assignment.creatorId,
    campaignId: assignment.campaignId,
    postId: input.postId,
    openedBy,
    openedByRole: viewer.role,
    reason: input.reason,
    customReason,
    description,
    status: "open",
  });
}

/** Reports a missing post and one from another assignment the same way. */
async function requirePostOnAssignment(
  ctx: MutationCtx,
  postId: Id<"posts">,
  assignmentId: Id<"assignments">,
): Promise<void> {
  const post = await ctx.db.get("posts", postId);
  const submission = post && (await ctx.db.get("submissions", post.submissionId));
  if (!submission || submission.assignmentId !== assignmentId) {
    throw apiError("not_found", { resource: "post" });
  }
}

/** "other" needs the opener's own reason; every other reason must leave it out. */
function requireCustomReason({
  reason,
  customReason,
}: Pick<DisputeCreate, "reason" | "customReason">): string | undefined {
  if (reason === "other") {
    return requireNonBlank(customReason ?? "", "customReason", MAX_LENGTH.customReason);
  }
  if (customReason !== undefined) {
    throw apiError("invalid_state", { reason: "custom_reason_not_allowed" });
  }
  return undefined;
}

/**
 * Closes an open dispute. Anyone on the opener's side can, and so can Tomoji.
 * Only the opener's side can withdraw. Errors are listed on the
 * `disputes.resolve` route.
 */
export async function resolveDispute(
  ctx: MutationCtx,
  viewer: AssignmentViewer,
  resolvedBy: Id<"users">,
  disputeId: Id<"disputes">,
  { outcome, note }: DisputeResolution,
): Promise<DisputeView> {
  const dispute = await requireVisibleDispute(ctx, viewer, disputeId);
  const isOpenerSide = viewer.role === dispute.openedByRole;
  if (!isOpenerSide && viewer.role !== "operator") {
    throw apiError("forbidden", { reason: "not_opener" });
  }
  if (dispute.status !== "open") {
    throw apiError("invalid_state", { reason: "already_resolved" });
  }
  if (outcome === "withdrawn" && !isOpenerSide) {
    throw apiError("invalid_state", { reason: "withdraw_by_opener_only" });
  }

  const resolved: ResolvedDispute = {
    ...dispute,
    status: "resolved",
    resolvedBy,
    resolvedByRole: viewer.role,
    resolvedAt: Date.now(),
    outcome,
    // A blank note is stored as no note.
    note: optionalNonBlank(note, "note", MAX_LENGTH.note),
  };
  await ctx.db.replace("disputes", dispute._id, resolved);
  return toDisputeView(viewer, resolved);
}

/**
 * Replaces the result the opener's side reported with Tomoji's ruling, keeping
 * the original as `overriddenResolution`. Tomoji's own rulings are final.
 * Errors are listed on the `disputes.override` route.
 */
export async function overrideDispute(
  ctx: MutationCtx,
  resolvedBy: Id<"users">,
  disputeId: Id<"disputes">,
  { outcome, note }: DisputeOverride,
): Promise<ResolvedDispute> {
  const dispute = await ctx.db.get("disputes", disputeId);
  if (dispute === null) throw apiError("not_found", { resource: "dispute" });
  if (dispute.status !== "resolved") {
    throw apiError("invalid_state", { reason: "dispute_not_resolved" });
  }
  if (dispute.resolvedByRole === "operator") {
    throw apiError("invalid_state", { reason: "operator_ruling_final" });
  }

  const overridden: ResolvedDispute = {
    ...dispute,
    resolvedBy,
    resolvedByRole: "operator",
    resolvedAt: Date.now(),
    outcome,
    note: requireNonBlank(note, "note", MAX_LENGTH.note),
    overriddenResolution: { resolvedBy: dispute.resolvedBy, ...withoutResolver(dispute) },
  };
  await ctx.db.replace("disputes", dispute._id, overridden);
  return overridden;
}

/** One dispute, as the viewer may see it. */
export async function requireDispute(
  ctx: QueryCtx,
  viewer: AssignmentViewer,
  disputeId: Id<"disputes">,
): Promise<DisputeView> {
  return toDisputeView(viewer, await requireVisibleDispute(ctx, viewer, disputeId));
}

/** Reports a missing dispute and someone else's the same way. */
async function requireVisibleDispute(
  ctx: QueryCtx,
  viewer: AssignmentViewer,
  disputeId: Id<"disputes">,
): Promise<Doc<"disputes">> {
  const dispute = await ctx.db.get("disputes", disputeId);
  // A dispute's company and creator are copied from its assignment, so the
  // assignment's access rule applies without reading it.
  if (dispute === null || !canViewResource(viewer, dispute)) {
    throw apiError("not_found", { resource: "dispute" });
  }
  return dispute;
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
    postId: dispute.postId,
    openedByRole: dispute.openedByRole,
    reason: dispute.reason,
    customReason: dispute.customReason,
    description: dispute.description,
  };
  if (dispute.status === "open") return { ...opened, status: "open" };
  const replaced = dispute.overriddenResolution;
  return {
    ...opened,
    status: "resolved",
    ...withoutResolver(dispute),
    overriddenResolution: replaced && withoutResolver(replaced),
  };
}

/** A resolution's fields minus who resolved it. Also used to copy one aside on override. */
function withoutResolver(
  resolution: Pick<ResolvedDispute, "resolvedByRole" | "resolvedAt" | "outcome" | "note">,
) {
  return {
    resolvedByRole: resolution.resolvedByRole,
    resolvedAt: resolution.resolvedAt,
    outcome: resolution.outcome,
    note: resolution.note,
  };
}
