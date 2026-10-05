import { defineTable } from "convex/server";
import { v } from "convex/values";

export const campaignStatus = v.union(
  v.literal("draft"),
  v.literal("open"),
  v.literal("paused"),
  v.literal("closed"),
);

export const campaignsTable = defineTable({
  companyId: v.id("companies"),
  createdBy: v.id("companyUsers"),
  title: v.string(),
  objective: v.string(),
  product: v.string(),
  audience: v.string(),
  description: v.string(),
  status: campaignStatus,
  // Server-managed while a campaign pause is still updating its opportunities.
  isPausingOpportunities: v.optional(v.boolean()),
  budgetCents: v.number(), // Nonnegative integer minor units; enforced by the model.
  startsAt: v.number(), // Unix timestamp in milliseconds.
  endsAt: v.optional(v.number()), // Unix milliseconds at :00/:30 UTC; enforced by the model.
})
  .index("by_companyId", ["companyId"])
  .index("by_companyId_and_status", ["companyId", "status"])
  .index("by_status_and_endsAt", ["status", "endsAt"]);
