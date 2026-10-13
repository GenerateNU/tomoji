import { paginationOptsValidator, type PaginationResult } from "convex/server";
import { v, type Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { apiError } from "../lib/errors";
import { requireNonBlank } from "../lib/validation";
import schema from "../schema";
import {
  companyDisputeReasons,
  creatorDisputeReasons,
  type disputeReason,
} from "../schemas/disputes.schema";
import { userRole } from "../schemas/users.schema";
import { requireAssignment, type AssignmentViewer } from "./assignments";

const disputeDoc = schema.doc("disputes");

export const disputeCreate = disputeDoc.pick(
  "assignmentId",
  "reason",
  "customReason",
  "description",
);
export type DisputeCreate = Infer<typeof disputeCreate>;

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

const MAX_LENGTH = {
  customReason: 200,
  description: 5000,
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
  const description = requireNonBlank(input.description, "description", MAX_LENGTH.description);

  return await ctx.db.insert("disputes", {
    assignmentId: assignment._id,
    companyId: assignment.companyId,
    creatorId: assignment.creatorId,
    campaignId: assignment.campaignId,
    openedBy,
    openedByRole: viewer.role,
    reason: input.reason,
    customReason,
    description,
    status: "open",
  });
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
    customReason: dispute.customReason,
    description: dispute.description,
    status: dispute.status,
    resolution: dispute.resolution,
  };
}
