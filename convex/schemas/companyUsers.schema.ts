import { defineTable } from "convex/server";
import { v } from "convex/values";

export const companyUsersTable = defineTable({
  userId: v.id("users"),
  companyId: v.id("companies"),
  role: v.string(),
})
  .index("by_userId", ["userId"])
  .index("by_companyId", ["companyId"])
  .index("by_userId_and_companyId", ["userId", "companyId"]);
