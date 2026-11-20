import { companyQuery } from "./lib/functions";
import { v } from "convex/values";
import {
  companyDrafts,
  companyEarnings,
  companyHomeRange,
  companyOffers,
  companyOverview,
  getCompanyDrafts,
  getCompanyEarnings,
  getCompanyOffers,
  getCompanyOverview,
} from "./models/companyHome";

/**
 * Current open campaigns and verified active-post views, plus spend and observed
 * view history in [from, to), a period of at most 31 days. Spend is gross payout
 * obligations transferred to creators, not provider fees or duplicate charges.
 * Missing metrics are null; consumers must label capped counts and partial totals.
 */
export const overview = companyQuery({
  args: companyHomeRange.fields,
  returns: companyOverview,
  handler: async (ctx, range) => await getCompanyOverview(ctx, ctx.membership.companyId, range),
});

/**
 * Unexpired offers, earliest expiry first; five previews and a bounded count.
 * Advance `asOf` with the display clock so offers expire without a database write.
 */
export const offers = companyQuery({
  args: { asOf: v.number() },
  returns: companyOffers,
  handler: async (ctx, { asOf }) => await getCompanyOffers(ctx, ctx.membership.companyId, asOf),
});

/** Latest drafts available for human review, newest first, with four preview media IDs. */
export const drafts = companyQuery({
  args: {},
  returns: companyDrafts,
  handler: async (ctx) => await getCompanyDrafts(ctx, ctx.membership.companyId),
});

/**
 * All outstanding approvals (including overdue), plus approved earnings finalized
 * in [from, to). Uses actual payout deadlines and dispute holds, not a fixed weekday.
 * Creator counts are distinct across the two sets. `canApprove` is informational;
 * payouts.approve independently checks current membership and disputes.
 */
export const earnings = companyQuery({
  args: companyHomeRange.fields,
  returns: companyEarnings,
  handler: async (ctx, range) => await getCompanyEarnings(ctx, ctx.membership, range),
});
