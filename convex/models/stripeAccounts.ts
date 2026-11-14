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
 * - `disconnected`: the creator removed Tomoji from their Stripe account, so
 *   Tomoji cannot pay into it; onboarding again creates a new account.
 */
export const stripeAccountStatus = v.union(
  v.literal("notStarted"),
  v.literal("actionRequired"),
  v.literal("inReview"),
  v.literal("ready"),
  v.literal("disconnected"),
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
  // Stripe's last flags may still say payouts are on; they no longer apply to Tomoji.
  if (account.disconnectedAt !== undefined) return "disconnected";
  // Requirements due by a future deadline do not stop payouts until then.
  if (account.payoutsEnabled) return "ready";
  if (!account.detailsSubmitted || account.requirementsDue) return "actionRequired";
  return "inReview";
}

async function getAccountCreation(
  ctx: QueryCtx | MutationCtx,
  creatorId: Id<"creators">,
): Promise<Doc<"stripeAccountCreations"> | null> {
  return await ctx.db
    .query("stripeAccountCreations")
    .withIndex("by_creatorId", (q) => q.eq("creatorId", creatorId))
    .unique();
}

/**
 * Records that Tomoji is about to ask Stripe for the creator's account, or
 * returns the attempt already pending with `retry: true`. A retry keeps the
 * original country, so the request repeats exactly and Stripe cannot create a
 * second account. `country` is the creator's profile country.
 *
 * @throws `not_found` if the creator no longer exists.
 * @throws `invalid_state` with reason `country_required` if nothing is pending
 * and the creator has not set a country, because Stripe fixes it for good.
 */
export async function beginAccountCreation(
  ctx: MutationCtx,
  creatorId: Id<"creators">,
  country: string | undefined,
): Promise<{ attempt: Doc<"stripeAccountCreations">; retry: boolean }> {
  await requireCreatorProfileById(ctx, creatorId);
  const pending = await getAccountCreation(ctx, creatorId);
  if (pending !== null) return { attempt: pending, retry: true };
  if (country === undefined) throw apiError("invalid_state", { reason: "country_required" });
  const id = await ctx.db.insert("stripeAccountCreations", {
    creatorId,
    country,
    startedAt: Date.now(),
  });
  const attempt = await ctx.db.get("stripeAccountCreations", id);
  if (attempt === null) throw new Error("inserted account creation vanished");
  return { attempt, retry: false };
}

/**
 * Forgets a pending attempt that Stripe refused outright, such as for an
 * unsupported country, so the creator can fix it and start over. Only for
 * refusals that prove no account was made.
 */
export async function abandonAccountCreation(
  ctx: MutationCtx,
  creatorId: Id<"creators">,
): Promise<void> {
  const pending = await getAccountCreation(ctx, creatorId);
  if (pending !== null) await ctx.db.delete("stripeAccountCreations", pending._id);
}

/**
 * Records the account Stripe just created for a creator and closes the pending
 * attempt. The index cannot enforce one row per creator, so the read and write
 * share this transaction. Saving the same account again returns the existing
 * row: concurrent onboarding requests share an idempotency key and receive the
 * same account. A disconnected account is replaced; the creator reconnected.
 *
 * @throws `not_found` if the creator no longer exists.
 * @throws `conflict` with reason `stripe_account_exists` if the creator
 * already has a different, connected Stripe account.
 */
export async function createStripeAccount(
  ctx: MutationCtx,
  creatorId: Id<"creators">,
  state: StripeAccountState,
): Promise<Doc<"stripeAccounts">> {
  await requireCreatorProfileById(ctx, creatorId);
  const existing = await getStripeAccountByCreatorId(ctx, creatorId);
  let id: Id<"stripeAccounts">;
  if (existing === null) {
    id = await ctx.db.insert("stripeAccounts", { creatorId, ...state });
  } else if (existing.stripeAccountId === state.stripeAccountId) {
    id = existing._id;
  } else if (existing.disconnectedAt !== undefined) {
    await ctx.db.replace("stripeAccounts", existing._id, { creatorId, ...state });
    id = existing._id;
  } else {
    throw apiError("conflict", { reason: "stripe_account_exists" });
  }
  await abandonAccountCreation(ctx, creatorId);
  const account = await ctx.db.get("stripeAccounts", id);
  if (account === null) throw new Error("saved Stripe account vanished");
  return account;
}

/**
 * Applies `account.application.deauthorized`: the creator removed Tomoji from
 * their Stripe account. Repeats keep the first time. `unknown` means another
 * deployment's account, or one the creator already replaced.
 */
export async function disconnectStripeAccount(
  ctx: MutationCtx,
  stripeAccountId: string,
  disconnectedAt: number,
): Promise<"disconnected" | "unknown"> {
  const account = await getStripeAccountByStripeId(ctx, stripeAccountId);
  if (account === null) return "unknown";
  if (account.disconnectedAt === undefined) {
    await ctx.db.patch("stripeAccounts", account._id, { disconnectedAt });
  }
  return "disconnected";
}

/**
 * Applies an `account.updated` webhook. Stripe delivers events out of order,
 * so a state older than the stored one is skipped. Equal timestamps apply:
 * Stripe's clock has one-second resolution, and the webhook passes the
 * account as Stripe has it now rather than the event's copy. It never clears
 * `disconnectedAt`; only reconnecting with a new account does.
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
  // Finished; a later reconnect must start a fresh attempt.
  await abandonAccountCreation(ctx, creatorId);
  return "adopted";
}
