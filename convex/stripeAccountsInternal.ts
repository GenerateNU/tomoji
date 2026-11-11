import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import {
  createStripeAccount,
  getStripeAccountByCreatorId,
  stripeAccountState,
  updateStripeAccount,
} from "./models/stripeAccounts";
import schema from "./schema";

/**
 * Database steps for the Stripe actions, which cannot read or write the
 * database themselves. Callers pass the creator `creatorAction` resolved, never
 * one taken from a client.
 */

export const getForCreator = internalQuery({
  args: { creatorId: v.id("creators") },
  returns: v.union(schema.doc("stripeAccounts"), v.null()),
  handler: async (ctx, args) => await getStripeAccountByCreatorId(ctx, args.creatorId),
});

/** Saves the account Stripe just created, as soon as it exists. */
export const create = internalMutation({
  args: { creatorId: v.id("creators"), state: stripeAccountState },
  returns: schema.doc("stripeAccounts"),
  handler: async (ctx, args) => await createStripeAccount(ctx, args.creatorId, args.state),
});

/** Applies a verified `account.updated` event from the Stripe webhook. */
export const update = internalMutation({
  args: { state: stripeAccountState, taggedCreatorId: v.optional(v.string()) },
  returns: v.union(
    v.literal("updated"),
    v.literal("stale"),
    v.literal("adopted"),
    v.literal("unknown"),
  ),
  handler: async (ctx, args) => await updateStripeAccount(ctx, args.state, args.taggedCreatorId),
});
