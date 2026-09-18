import { defineTable } from "convex/server";
import { v } from "convex/values";

export const companyRole = v.union(v.literal("admin"), v.literal("member"));

export const companyUsersTable = defineTable({
  userId: v.id("users"),
  companyId: v.id("companies"),
  role: companyRole,
})
  .index("by_userId", ["userId"])
  .index("by_companyId", ["companyId"])
  .index("by_userId_and_companyId", ["userId", "companyId"]);
