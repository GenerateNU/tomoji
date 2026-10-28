import { defineTable } from "convex/server";
import { v } from "convex/values";

export const userRole = v.union(v.literal("creator"), v.literal("company"), v.literal("operator"));

export const deactivatedReason = v.union(
  v.literal("left_company"),
  v.literal("deleted"),
  v.literal("operator"),
  v.literal("duplicate_email"),
);

export const usersTable = defineTable({
  workosId: v.string(),
  firstName: v.string(), // Always nonblank; falls back to the email.
  lastName: v.string(), // Empty when the identity provider sends none.
  email: v.string(),
  role: userRole,
  isActive: v.boolean(),
  deactivatedReason: v.optional(deactivatedReason),
  profilePictureMediaId: v.optional(v.id("mediaUploads")),
})
  .index("by_workosId", ["workosId"])
  .index("by_email", ["email"])
  .index("by_role", ["role"])
  .index("by_isActive", ["isActive"])
  .index("by_role_and_isActive", ["role", "isActive"]);
