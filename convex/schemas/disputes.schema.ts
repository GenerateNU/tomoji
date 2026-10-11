import { defineTable } from "convex/server";
import {
  v,
  type GenericId as Id,
  type OptionalProperty,
  type PropertyValidators,
  type Validator,
} from "convex/values";
import { userRole } from "./users.schema";

// Each side has its own reasons; operators may give any of them.
export const companyDisputeReasons = [
  "missingDisclosure",
  "publishedWithoutApproval",
  "productMisuse",
  "postRemoved",
  "other",
] as const;

export const creatorDisputeReasons = [
  "payoutAmount",
  "paymentNotReceived",
  "unfairReview",
  "deadline",
  "other",
] as const;

export const disputeReason = v.union(
  v.literal("missingDisclosure"),
  v.literal("publishedWithoutApproval"),
  v.literal("productMisuse"),
  v.literal("postRemoved"),
  v.literal("payoutAmount"),
  v.literal("paymentNotReceived"),
  v.literal("unfairReview"),
  v.literal("deadline"),
  v.literal("other"),
);

// TODO(disputes): more states (e.g. awaiting response, withdrawn) as the flow grows.
export const disputeStatus = v.union(v.literal("open"), v.literal("resolved"));

// Provisional until design confirms the list.
export const disputeOutcome = v.union(
  v.literal("inCompanyFavor"),
  v.literal("inCreatorFavor"),
  v.literal("termsKept"),
  v.literal("adjusted"),
);

const disputeFields = {
  assignmentId: v.id("assignments"),
  // Copied from the assignment for the list indexes; none of them can change.
  companyId: v.id("companies"),
  creatorId: v.id("creators"),
  campaignId: v.id("campaigns"),
  // Lets creators see which side opened it without seeing who.
  openedByRole: userRole,
  reason: disputeReason,
  description: v.string(),
  // Recorded by the server when it's opened: the assignment's approved
  // submission and its posts. Never changes after.
  evidenceSubmissionIds: v.array(v.id("submissions")),
  evidencePostIds: v.array(v.id("posts")),
};

type UserIdValidator = Validator<Id<"users"> | undefined, OptionalProperty, string>;

/**
 * Both shapes a dispute can take, shared by the table and the read view. User
 * IDs are separate type parameters so TypeScript keeps their exact types.
 */
export function disputeShapes<
  OpenedBy extends UserIdValidator,
  ResolvedBy extends UserIdValidator,
  Extra extends PropertyValidators,
>(openedBy: OpenedBy, resolvedBy: ResolvedBy, extraFields: Extra) {
  const base = { ...disputeFields, openedBy, ...extraFields };
  return [
    v.object({ ...base, status: v.literal("open") }),
    v.object({
      ...base,
      status: v.literal("resolved"),
      resolvedBy,
      resolvedAt: v.number(), // Unix milliseconds.
      outcome: disputeOutcome,
      decision: v.string(),
    }),
  ] as const;
}

// List indexes end in `resolvedAt` so resolved disputes sort by closing time;
// open ones have none and fall back to `_creationTime`.
export const disputesTable = defineTable(
  v.union(...disputeShapes(v.id("users"), v.id("users"), {})),
)
  .index("by_companyId_and_status_and_resolvedAt", ["companyId", "status", "resolvedAt"])
  .index("by_companyId_and_status_and_openedByRole_and_resolvedAt", [
    "companyId",
    "status",
    "openedByRole",
    "resolvedAt",
  ])
  .index("by_creatorId_and_status_and_resolvedAt", ["creatorId", "status", "resolvedAt"])
  .index("by_creatorId_and_status_and_openedByRole_and_resolvedAt", [
    "creatorId",
    "status",
    "openedByRole",
    "resolvedAt",
  ])
  .index("by_status_and_resolvedAt", ["status", "resolvedAt"])
  .index("by_status_and_openedByRole_and_resolvedAt", ["status", "openedByRole", "resolvedAt"])
  .index("by_openedBy", ["openedBy"])
  .index("by_resolvedBy", ["resolvedBy"]);
