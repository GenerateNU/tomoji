import { defineTable } from "convex/server";
import { v } from "convex/values";

export const xAccountStatus = v.union(v.literal("connected"), v.literal("reconnect_required"));

export const xAccountsTable = defineTable({
  creatorId: v.id("creators"),
  xUserId: v.string(),
  username: v.string(),
  displayName: v.string(),
  linkedAt: v.number(),
  updatedAt: v.number(),
  status: xAccountStatus,
})
  .index("by_creatorId", ["creatorId"])
  .index("by_xUserId", ["xUserId"]);
