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
    userId: v.string(),
    companyId: v.string(),
    role: v.string(),
  }),
  creators: defineTable({
    userId: v.string(),
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
});
