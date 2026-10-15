import { defineTable } from "convex/server";
import { v } from "convex/values";

export const creatorsTable = defineTable({
  userId: v.id("users"),
  username: v.optional(v.string()),
  // Legacy unverified value retained for schema compatibility only. Profiles
  // read verified identity from xAccounts; this field is not client-editable.
  xId: v.optional(v.string()),
  githubLink: v.optional(v.string()),
  phoneNumber: v.optional(v.string()),
  // Names from the fixed list in models/niches.ts. Optional so existing rows
  // need no migration; read missing as "no niches".
  niches: v.optional(v.array(v.string())),
})
  .index("by_userId", ["userId"])
  .index("by_username", ["username"]);
