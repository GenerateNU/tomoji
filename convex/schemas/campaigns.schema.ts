import { defineTable } from "convex/server";
import { v } from "convex/values";

export const campaignFormat = v.union(
  v.literal("video"),
  v.literal("photo"),
  v.literal("photo_and_text"),
  v.literal("video_and_text"),
);
export const campaignStatus = v.union(v.literal("draft"), v.literal("open"), v.literal("closed"));

export const campaignsTable = defineTable({
  companyId: v.id("companies"),
  title: v.string(),
  description: v.string(),
  createdBy: v.id("companyUsers"),
  format: campaignFormat,
  status: campaignStatus,
  isVetted: v.boolean(),
  maxApplications: v.number(),
  maxOpenings: v.number(),
  deadline: v.number(), // timestamp
  audience: v.optional(v.string()),
  talkingPoints: v.optional(v.array(v.string())),
  prohibitedClaims: v.optional(v.array(v.string())),
  disclosureRequirements: v.optional(v.array(v.string())),
  usageRights: v.optional(v.string()),
}).index("by_companyId_status_and_deadline", ["companyId", "status", "deadline"]);
