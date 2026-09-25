import { defineTable } from "convex/server";
import { v } from "convex/values";

export const opportunityStatus = v.union(
  v.literal("draft"),
  v.literal("open"),
  v.literal("paused"),
  v.literal("closed"),
);

export const opportunitiesTable = defineTable({
  campaignId: v.id("campaigns"),
  createdBy: v.id("companyUsers"),
  title: v.string(),
  description: v.string(),
  isGated: v.boolean(),
  usesAiReviewDefault: v.boolean(),
  targetApplicant: v.string(),
  maxSlots: v.number(),
  // Future assignment mutations must maintain this count transactionally.
  numFilledSlots: v.number(),
  maxApplications: v.number(),
  deadline: v.number(), // Unix milliseconds.
  status: opportunityStatus,
  // Default compensation: integer cents; CPM is cents per 1,000 eligible views.
  fixedFeeCents: v.number(),
  cpmRateCents: v.number(),
  paymentCapCents: v.number(),
  contentRequirements: v.string(),
  prohibitedClaims: v.array(v.string()),
  disclosureRequirements: v.array(v.string()),
  usageRights: v.string(),
  productAccessLink: v.optional(v.string()),
})
  .index("by_campaignId_and_status", ["campaignId", "status"])
  .index("by_createdBy", ["createdBy"])
  .index("by_status_and_deadline", ["status", "deadline"]);
