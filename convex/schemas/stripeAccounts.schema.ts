import { defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * A creator's Stripe Connect Standard account. Onboarding status is derived
 * from the flags and `disconnectedAt` rather than stored. `onboardingLink`
 * saves a new account; after that, only what Stripe reports changes it. A
 * creator who reconnects gets a new account in place of the disconnected one.
 */
export const stripeAccountsTable = defineTable({
  creatorId: v.id("creators"),
  stripeAccountId: v.string(),
  // The creator finished Stripe's onboarding form.
  detailsSubmitted: v.boolean(),
  // Stripe has verified them and they can receive money.
  payoutsEnabled: v.boolean(),
  // Stripe is waiting on the creator: its `requirements.currently_due` list is
  // not empty. False after submission means Stripe is still verifying.
  requirementsDue: v.boolean(),
  // When Tomoji read the stored state from Stripe, in Unix ms on our clock.
  // Webhook deliveries can save in any order, so earlier reads are skipped
  // against this.
  stripeUpdatedAt: v.number(),
  // Stripe declined the account for good (`requirements.disabled_reason` is
  // `rejected.*`, such as fraud); the creator cannot fix it by onboarding.
  // Absent on rows saved before this was tracked.
  rejected: v.optional(v.boolean()),
  // When the creator removed Tomoji from their Stripe account, in Unix ms.
  // Tomoji can no longer use it, whatever the flags say.
  disconnectedAt: v.optional(v.number()),
})
  .index("by_creatorId", ["creatorId"])
  .index("by_stripeAccountId", ["stripeAccountId"]);

/**
 * A Stripe account creation that has started but whose account is not saved
 * yet, recorded before Stripe is called. A retry repeats exactly this request,
 * so a crash between Stripe creating the account and Tomoji saving it cannot
 * produce a second account, even if the creator's country changes meanwhile.
 * Deleted when the account is saved.
 */
export const stripeAccountCreationsTable = defineTable({
  creatorId: v.id("creators"),
  // ISO 3166-1 alpha-2. Stripe cannot change an account's country later.
  country: v.string(),
  // Unix ms, our clock, just before the first request to Stripe.
  startedAt: v.number(),
}).index("by_creatorId", ["creatorId"]);
