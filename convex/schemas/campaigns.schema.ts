import { defineTable } from "convex/server";
import { v } from "convex/values";

export const campaignsTable = defineTable({
  companyId: v.id("companies"),
  createdBy: v.id("companyUsers"),
  title: v.string(),
  objective: v.string(),
  product: v.string(),
  audience: v.string(),
  description: v.string(),
  budgetCents: v.number(), // Nonnegative integer minor units; enforced by the model.
  startsAt: v.number(), // Unix timestamp in milliseconds.
  endsAt: v.optional(v.number()), // Unix timestamp in milliseconds.
}).index("by_companyId", ["companyId"]);
