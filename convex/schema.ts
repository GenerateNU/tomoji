import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    workosId: v.string(),
    name: v.string(),
    email: v.string(),
    role: v.string(),
    is_active: v.boolean(),
    profilePicture: v.optional(v.string()),
  }),
  companyUsers: defineTable({
    userId: v.id("users"),
    companyId: v.id("companies"),
    role: v.string(),
  }),
  creators: defineTable({
    userId: v.id("users"),
    xId: v.string(),
    githubLink: v.string(),
    phoneNumber: v.optional(v.string()),
  }),
  companies: defineTable({
    workosId: v.string(),
    name: v.string(),
    isActive: v.boolean(),
    profilePicture: v.optional(v.string()),
  }),
  campaigns: defineTable({
    companyId: v.id("companies"),
    title: v.string(),
    description: v.string(),
    createdBy: v.id("companyUsers"),
    format: v.union(
      v.literal("video"),
      v.literal("photo"),
      v.literal("photo_and_text"),
      v.literal("video_and_text"),
    ),
    status: v.union(v.literal("draft"), v.literal("open"), v.literal("closed")),
    isVetted: v.boolean(),
    maxApplications: v.number(),
    maxOpenings: v.number(),
    deadline: v.number(), // will be a timestamp
    audience: v.optional(v.string()),
    talkingPoints: v.optional(v.array(v.string())),
    prohibitedClaims: v.optional(v.array(v.string())),
    disclosureRequirements: v.optional(v.array(v.string())),
    usageRights: v.optional(v.string()),
  }).index("by_company_status_and_deadline", ["companyId", "status", "deadline"]),
  campaignCreators: defineTable({
    userId: v.id("users"),
    campaignId: v.id("campaigns"),
    stage: v.union(v.literal("pending"), v.literal("accepted"), v.literal("rejected")),
    selectedAt: v.optional(v.number()),
    acceptedAt: v.optional(v.number()),
  })
    .index("by_userId", ["userId"])
    .index("by_campaignId", ["campaignId"])
    .index("by_campaignId_and_userId", ["campaignId", "userId"])
    .index("by_campaignId_and_stage", ["campaignId", "stage"]),
  submissions: defineTable({
    campaignCreatorId: v.id("campaignCreators"),
    status: v.union(
      v.literal("draft"),
      v.literal("pending"),
      v.literal("accepted"),
      v.literal("rejected"),
      v.literal("needsRevision"),
    ),
  }),
  posts: defineTable({
    submissionId: v.id("submissions"),
    campaignId: v.id("campaigns"),
    platform: v.union(v.literal("X")), // add more as more are supported
    status: v.union(v.literal("pending"), v.literal("posted"), v.literal("toRetry")),
    linkToPost: v.optional(v.string()),
  }),
});
