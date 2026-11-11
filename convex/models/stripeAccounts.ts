import { v, type Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { apiError } from "../lib/errors";
import { requireCreatorProfileById } from "./creators";

/**
 * What a creator has to do about Stripe, named for the action rather than for
 * Stripe's internal stages. Derived from the row's Stripe fields each time
 * instead of saved, so it always matches what Stripe last sent.
 *
 * - `notStarted`: no account yet; start onboarding.
 * - `actionRequired`: the form is unfinished, or Stripe needs more information
 *   (for example after failed verification); continue onboarding.
 * - `inReview`: submitted and nothing due; Stripe is verifying asynchronously,
 *   usually minutes, occasionally a few business days for documents.
 * - `ready`: Stripe allows payouts.
 */
export const stripeAccountStatus = v.union(
  v.literal("notStarted"),
  v.literal("actionRequired"),
  v.literal("inReview"),
  v.literal("ready"),
);

/** What Stripe reported about an account, and when (Unix ms, Stripe's clock). */
export const stripeAccountState = v.object({
  stripeAccountId: v.string(),
  detailsSubmitted: v.boolean(),
  payoutsEnabled: v.boolean(),
  requirementsDue: v.boolean(),
  stripeUpdatedAt: v.number(),
});

export type StripeAccountStatus = Infer<typeof stripeAccountStatus>;
export type StripeAccountState = Infer<typeof stripeAccountState>;

export async function getStripeAccountByCreatorId(
  ctx: QueryCtx | MutationCtx,
  creatorId: Id<"creators">,
): Promise<Doc<"stripeAccounts"> | null> {
  return await ctx.db
    .query("stripeAccounts")
    .withIndex("by_creatorId", (q) => q.eq("creatorId", creatorId))
    .unique();
}

export async function getStripeAccountByStripeId(
  ctx: QueryCtx | MutationCtx,
  stripeAccountId: string,
): Promise<Doc<"stripeAccounts"> | null> {
  return await ctx.db
    .query("stripeAccounts")
    .withIndex("by_stripeAccountId", (q) => q.eq("stripeAccountId", stripeAccountId))
    .unique();
}

export function toStripeAccountStatus(account: Doc<"stripeAccounts"> | null): StripeAccountStatus {
  if (account === null) return "notStarted";
  // Requirements due by a future deadline do not stop payouts until then.
  if (account.payoutsEnabled) return "ready";
  if (!account.detailsSubmitted || account.requirementsDue) return "actionRequired";
  return "inReview";
}

/**
 * Records the account Stripe just created for a creator. The index cannot
 * enforce one row per creator, so the read and insert share this transaction.
 * Saving the same account again returns the existing row: concurrent
 * onboarding requests share an idempotency key and receive the same account.
 *
 * @throws `not_found` if the creator no longer exists.
 * @throws `conflict` with reason `stripe_account_exists` if the creator
 * already has a different Stripe account.
 */
export async function createStripeAccount(
  ctx: MutationCtx,
  creatorId: Id<"creators">,
  state: StripeAccountState,
): Promise<Doc<"stripeAccounts">> {
  await requireCreatorProfileById(ctx, creatorId);
  const existing = await getStripeAccountByCreatorId(ctx, creatorId);
  if (existing !== null) {
    if (existing.stripeAccountId === state.stripeAccountId) return existing;
    throw apiError("conflict", { reason: "stripe_account_exists" });
  }
  const id = await ctx.db.insert("stripeAccounts", { creatorId, ...state });
  const account = await ctx.db.get("stripeAccounts", id);
  if (account === null) throw new Error("inserted Stripe account vanished");
  return account;
}

/**
 * Applies an `account.updated` webhook. Stripe delivers events out of order,
 * so a state older than the stored one is skipped; equal timestamps apply,
 * because Stripe's clock has one-second resolution.
 *
 * `taggedCreatorId` is the `metadata.creatorId` set when the account was
 * created. If the server stopped before saving a new account, this adopts it
 * for that creator. `unknown` means the account is not ours to record:
 * another deployment sharing the Stripe sandbox made it, or the creator
 * already has a different account.
 */
export async function updateStripeAccount(
  ctx: MutationCtx,
  state: StripeAccountState,
  taggedCreatorId?: string,
): Promise<"updated" | "stale" | "adopted" | "unknown"> {
  const account = await getStripeAccountByStripeId(ctx, state.stripeAccountId);
  if (account === null) return await adoptStripeAccount(ctx, state, taggedCreatorId);
  if (state.stripeUpdatedAt < account.stripeUpdatedAt) return "stale";
  await ctx.db.patch("stripeAccounts", account._id, {
    detailsSubmitted: state.detailsSubmitted,
    payoutsEnabled: state.payoutsEnabled,
    requirementsDue: state.requirementsDue,
    stripeUpdatedAt: state.stripeUpdatedAt,
  });
  return "updated";
}

async function adoptStripeAccount(
  ctx: MutationCtx,
  state: StripeAccountState,
  taggedCreatorId: string | undefined,
): Promise<"adopted" | "unknown"> {
  if (taggedCreatorId === undefined) return "unknown";
  // Null for another deployment's id, so a foreign tag cannot match a creator here.
  const creatorId = ctx.db.normalizeId("creators", taggedCreatorId);
  if (creatorId === null || (await ctx.db.get("creators", creatorId)) === null) return "unknown";
  if ((await getStripeAccountByCreatorId(ctx, creatorId)) !== null) return "unknown";
  await ctx.db.insert("stripeAccounts", { creatorId, ...state });
  return "adopted";
}
