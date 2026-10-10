import { defineTable } from "convex/server";
import { v } from "convex/values";

export const xLinkAttemptsTable = defineTable({
  creatorId: v.id("creators"),
  stateHash: v.string(),
  // Server-only PKCE secret, removed as soon as an exchange starts.
  verifier: v.optional(v.string()),
  redirectUri: v.string(),
  expiresAt: v.number(),
  status: v.union(v.literal("pending"), v.literal("exchanging"), v.literal("failed")),
}).index("by_creatorId", ["creatorId"]);
