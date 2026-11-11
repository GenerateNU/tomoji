import { defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * A creator's Stripe Connect Express account. Onboarding status is derived
 * from the two flags rather than stored; only the `account.updated` webhook
 * changes them.
 */
export const stripeAccountsTable = defineTable({
  creatorId: v.id("creators"),
  stripeAccountId: v.string(),
  // The creator finished Stripe's onboarding form.
  detailsSubmitted: v.boolean(),
  // Stripe has verified them and they can receive money.
  payoutsEnabled: v.boolean(),
  // When Stripe produced the stored state, in Unix ms. Stripe does not deliver
  // webhooks in order, so older events are skipped against this.
  stripeUpdatedAt: v.number(),
})
  .index("by_creatorId", ["creatorId"])
  .index("by_stripeAccountId", ["stripeAccountId"]);
