import { defineTable } from "convex/server";
import { v } from "convex/values";
import { companyRole } from "./companyUsers.schema";

/** Who an invite makes the recipient once they accept. */
export const inviteKind = v.union(
  v.literal("creator"),
  v.literal("companyUser"),
  v.literal("operator"),
);

/**
 * An invitation WorkOS has sent and nobody has accepted yet. Written only by
 * the `invitation.*` webhooks, so it cannot drift from WorkOS: accepting,
 * revoking, or expiring removes the row.
 */
export const invitesTable = defineTable({
  workosId: v.string(),
  email: v.string(),
  kind: inviteKind,
  // Set for companyUser invites; absent for creators and operators.
  companyId: v.optional(v.id("companies")),
  role: v.optional(companyRole),
  expiresAt: v.number(), // Unix milliseconds.
})
  .index("by_workosId", ["workosId"])
  .index("by_email", ["email"])
  .index("by_companyId", ["companyId"])
  .index("by_kind", ["kind"]);
