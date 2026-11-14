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

// TODO(disputes): more states (e.g. awaiting response) as the flow grows.
export const disputeStatus = v.union(v.literal("open"), v.literal("resolved"));

/** How a dispute ended. "approved" means in the opener's favor. */
export const disputeOutcome = v.union(
  v.literal("approved"),
  v.literal("denied"),
  v.literal("withdrawn"),
);

/** What Tomoji can rule when overriding; withdrawing is the opener's choice. */
export const operatorDisputeOutcome = v.union(v.literal("approved"), v.literal("denied"));

const disputeFields = {
  assignmentId: v.id("assignments"),
  // Copied from the assignment for the list indexes; none of them can change.
  companyId: v.id("companies"),
  creatorId: v.id("creators"),
  campaignId: v.id("campaigns"),
  // The post it's about, if the opener picked one. Always a post on this assignment.
  postId: v.optional(v.id("posts")),
  // Lets creators see which side opened it without seeing who.
  openedByRole: userRole,
  reason: disputeReason,
  // The opener's own words when `reason` is "other", and only then.
  customReason: v.optional(v.string()),
  description: v.string(),
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
  const resolution = {
    resolvedBy,
    // Lets creators see which side closed it without seeing who.
    resolvedByRole: userRole,
    resolvedAt: v.number(), // Unix milliseconds.
    outcome: disputeOutcome,
    note: v.optional(v.string()),
  };
  return [
    v.object({ ...base, status: v.literal("open") }),
    v.object({
      ...base,
      status: v.literal("resolved"),
      ...resolution,
      // The opener's result, kept when Tomoji overrides it.
      overriddenResolution: v.optional(v.object(resolution)),
    }),
  ] as const;
}

// List indexes end in `resolvedAt` so resolved disputes sort by closing time;
// open ones have none and fall back to `_creationTime`.
export const disputesTable = defineTable(
  v.union(...disputeShapes(v.id("users"), v.id("users"), {})),
)
  .index("by_assignmentId", ["assignmentId"])
  .index("by_assignmentId_and_status", ["assignmentId", "status"])
  .index("by_postId", ["postId"])
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
