import { defineTable } from "convex/server";
import { v } from "convex/values";

// No application-level encryption. Restrict dashboard/export access and never expose
// this table through a public function, profile response, or log.
export const xAccountCredentialsTable = defineTable({
  xAccountId: v.id("xAccounts"),
  accessToken: v.string(),
  refreshToken: v.string(),
  accessTokenExpiresAt: v.number(),
  scopes: v.array(v.string()),
  credentialVersion: v.number(),
}).index("by_xAccountId", ["xAccountId"]);
