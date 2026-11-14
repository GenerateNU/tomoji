import type { PaginationOptions, PaginationResult } from "convex/server";
import { v, type Infer } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { apiError } from "../lib/errors";
import { canViewResource, type ResourceViewer } from "../lib/authz";
import { APPLICATION_SWEEP_BATCH } from "../lib/pagination";
import { HALF_HOUR_MS, isHalfHourTimestamp } from "../lib/validation";
import { followerRange } from "../schemas/creators.schema";
import { applicationStatus } from "../schemas/applications.schema";

import { assignmentTarget, createAssignmentFromOffer } from "./assignments";
import { creatorName, notifyCompanyUser, notifyCreator } from "./notifications";
import {
  getOpportunityView,
  getVisibleOpportunityCompany,
  toCreatorOpportunity,
  creatorOpportunity,
} from "./opportunities";
import { listStarredOpportunityIds } from "./opportunityStars";

export { APPLICATION_SWEEP_BATCH };

/**
 * Creates a pending application from a creator to an open, gated opportunity.
 *
 * @throws `not_found` if the opportunity does not exist.
 * The note is optional; a missing or blank note is left out.
 *
 * @throws `invalid_state` if the opportunity or its campaign is not open, the
 * opportunity is ungated, or every slot is already filled.
 * @throws `conflict` if the creator has already applied.
 */
export async function createApplication(
  ctx: MutationCtx,
  creatorId: Id<"creators">,
  args: { opportunityId: Id<"opportunities">; note?: string },
): Promise<Id<"applications">> {
  const note = args.note?.trim() || undefined;
  const opportunity = await ctx.db.get("opportunities", args.opportunityId);
  if (opportunity === null) {
    throw apiError("not_found", { resource: "opportunity" });
  }
  const campaign = await requireOpportunityOpen(ctx, opportunity);
  // Ungated opportunities are joined directly, without an application.
  if (!opportunity.isGated) {
    throw apiError("invalid_state", { reason: "opportunity_not_gated" });
  }
  // Applications are uncapped, but a full opportunity has nothing left to offer.
  // Read here rather than relying on the sweep, which runs in a later transaction.
  if (opportunity.numFilledSlots >= opportunity.maxSlots) {
    throw apiError("invalid_state", { reason: "opportunity_full" });
  }
  // One application per creator per opportunity: blocks double-submits and
  // retries, which the non-unique index cannot prevent on its own.
  const existing = await ctx.db
    .query("applications")
    .withIndex("by_opportunityId_and_creatorId", (q) =>
      q.eq("opportunityId", args.opportunityId).eq("creatorId", creatorId),
    )
    .first();
  if (existing !== null) {
    throw apiError("conflict", { reason: "already_applied" });
  }

  const applicationId = await ctx.db.insert("applications", {
    opportunityId: opportunity._id,
    creatorId,
    companyId: campaign.companyId,
    note,
    status: "pending",
  });
  await notifyCompanyUser(ctx, opportunity.createdBy, {
    type: "applicationReceived",
    title: `${await creatorName(ctx, creatorId)} applied to ${opportunity.title}`,
    target: applicationTarget({
      _id: applicationId,
      opportunityId: opportunity._id,
    }),
  });
  return applicationId;
}

/** Links a notification to the application, alongside its opportunity. */
function applicationTarget(application: Pick<Doc<"applications">, "_id" | "opportunityId">) {
  return {
    kind: "application" as const,
    applicationId: application._id,
    opportunityId: application.opportunityId,
  };
}

/**
 * Requires the opportunity and its campaign to be open. While paused or closed,
 * only creators may act on existing offers, so applying, offering, and rejecting
 * are all refused. Check the campaign because its opportunities pause in batches.
 *
 * @throws `invalid_state` with `opportunity_not_open` or `campaign_not_open`.
 */
async function requireOpportunityOpen(
  ctx: MutationCtx,
  opportunity: Doc<"opportunities">,
): Promise<Doc<"campaigns">> {
  if (opportunity.status !== "open") {
    throw apiError("invalid_state", { reason: "opportunity_not_open" });
  }
  const campaign = await ctx.db.get("campaigns", opportunity.campaignId);
  if (campaign === null) {
    throw apiError("not_found", { resource: "opportunity" });
  }
  if (campaign.status !== "open") {
    throw apiError("invalid_state", { reason: "campaign_not_open" });
  }
  return campaign;
}

/** Who is reading an application, resolved from the caller by the route. */
export type ApplicationViewer = ResourceViewer;

/**
 * Returns an application the viewer may see: creators see their own, company
 * users see applications to their company's opportunities, and operators see
 * all.
 *
 * @throws `not_found` if the application does not exist or the viewer may not
 * see it, so callers cannot probe for other applications.
 */
export async function requireApplication(
  ctx: QueryCtx | MutationCtx,
  viewer: ApplicationViewer,
  applicationId: Id<"applications">,
): Promise<Doc<"applications">> {
  const application = await ctx.db.get("applications", applicationId);
  if (application === null || !canViewResource(viewer, application)) {
    throw apiError("not_found", { resource: "application" });
  }
  return application;
}

/**
 * Which application statuses each tab of the creator's applications table
 * lists. Every status belongs to exactly one tab.
 */
export const APPLICATION_TAB_STATUSES = {
  applications: ["pending", "rejected", "opportunityFull"],
  offers: ["offered", "offerExpired", "declined"],
  accepted: ["accepted"],
} as const satisfies Record<string, readonly Infer<typeof applicationStatus>[]>;

/** Most applications read for the table in one query, shared across a tab's statuses. */
export const MAX_APPLICATIONS_READ = 300;

const MAX_SEARCH_LENGTH = 100;
const MAX_PAGE_SIZE = 50;

const applicationRowStatus = v.union(
  v.literal("pending"),
  v.literal("rejected"),
  v.literal("opportunityFull"),
  v.literal("offered"),
  v.literal("offerExpired"),
  v.literal("declined"),
  v.literal("accepted"),
);

/** The tabs a creator can request rows for. */
export const applicationTab = v.union(
  v.literal("applications"),
  v.literal("offers"),
  v.literal("accepted"),
);
export type ApplicationTab = Infer<typeof applicationTab>;

export const applicationSearch = v.object({
  tab: applicationTab,
  search: v.optional(v.string()),
  starred: v.optional(v.boolean()),
  hideRejected: v.optional(v.boolean()),
  sort: v.optional(
    v.object({
      key: v.union(
        v.literal("name"),
        v.literal("company"),
        v.literal("status"),
        v.literal("submitted"),
        v.literal("compensation"),
        v.literal("expires"),
        v.literal("accepted"),
      ),
      direction: v.union(v.literal("ascending"), v.literal("descending")),
    }),
  ),
  page: v.number(),
  pageSize: v.number(),
});
export type ApplicationSearch = Infer<typeof applicationSearch>;

const tabCount = v.object({ count: v.number(), isCapped: v.boolean() });

export const applicationRow = v.object({
  applicationId: v.id("applications"),
  opportunityId: v.id("opportunities"),
  status: applicationRowStatus,
  submittedAt: v.number(),
  offerExpiresAt: v.optional(v.number()),
  offerAcceptedAt: v.optional(v.number()),
  title: v.string(),
  companyName: v.string(),
  companyLogoMediaId: v.optional(v.id("mediaUploads")),
  fixedFeeCents: v.number(),
  cpmRateCents: v.number(),
  paymentCapCents: v.number(),
  isStarred: v.boolean(),
  canStar: v.boolean(),
});
export type ApplicationRow = Infer<typeof applicationRow>;

export const applicationSearchResult = v.object({
  tab: applicationTab,
  rows: v.array(applicationRow),
  page: v.number(),
  pageSize: v.number(),
  totalCount: v.number(),
  pageCount: v.number(),
  counts: v.object({
    applications: tabCount,
    offers: tabCount,
    accepted: tabCount,
  }),
});

/**
 * Reads a tab's applications newest first within each status, stopping at the
 * limit. Reaching the limit means more may exist, so the tab reports as capped.
 */
async function readTabApplications(
  ctx: QueryCtx,
  creatorId: Id<"creators">,
  statuses: readonly Infer<typeof applicationStatus>[],
  limit: number,
): Promise<{ applications: Doc<"applications">[]; isCapped: boolean }> {
  const applications: Doc<"applications">[] = [];
  for (const status of statuses) {
    const remaining = limit - applications.length;
    if (remaining <= 0) break;
    applications.push(
      ...(await ctx.db
        .query("applications")
        .withIndex("by_creatorId_and_status", (q) =>
          q.eq("creatorId", creatorId).eq("status", status),
        )
        .order("desc")
        .take(remaining)),
    );
  }
  return { applications, isCapped: applications.length >= limit };
}

// Ranks only compare rows within one tab, so the tabs can reuse 0 to 2.
// `opportunityFull` shares `rejected`'s rank: creators see both as "Rejected",
// so the status sort groups them and the tie-break orders them together.
const STATUS_RANK: Record<Infer<typeof applicationRowStatus>, number> = {
  pending: 0,
  opportunityFull: 2,
  rejected: 2,
  offered: 0,
  offerExpired: 1,
  declined: 2,
  accepted: 0,
};

const DEFAULT_SORT_BY_TAB: Record<ApplicationTab, NonNullable<ApplicationSearch["sort"]>> = {
  applications: { key: "submitted", direction: "descending" },
  offers: { key: "expires", direction: "ascending" },
  accepted: { key: "accepted", direction: "descending" },
};

/**
 * Compares two optional timestamps in the requested direction, with a missing
 * one last in both directions. Returns 0 when equal, so callers can tie-break.
 */
function compareMissingLast(
  a: number | undefined,
  b: number | undefined,
  direction: "ascending" | "descending",
): number {
  if (a === b) return 0;
  if (a === undefined) return 1;
  if (b === undefined) return -1;
  return direction === "ascending" ? a - b : b - a;
}

function compareRows(
  a: ApplicationRow,
  b: ApplicationRow,
  sort: NonNullable<ApplicationSearch["sort"]>,
): number {
  if (sort.key === "expires") {
    // Groups keep a fixed order whatever the direction: live offers, then expired, then declined.
    const group = STATUS_RANK[a.status] - STATUS_RANK[b.status];
    if (group !== 0) return group;
    // An offer without an expiry sorts last within its group in both directions.
    const byExpiry = compareMissingLast(a.offerExpiresAt, b.offerExpiresAt, sort.direction);
    if (byExpiry !== 0) return byExpiry;
    return b.submittedAt - a.submittedAt || a.applicationId.localeCompare(b.applicationId);
  }
  if (sort.key === "accepted") {
    const byAccepted = compareMissingLast(a.offerAcceptedAt, b.offerAcceptedAt, sort.direction);
    if (byAccepted !== 0) return byAccepted;
    return b.submittedAt - a.submittedAt || a.applicationId.localeCompare(b.applicationId);
  }
  const primary = {
    name: () => a.title.localeCompare(b.title),
    company: () => a.companyName.localeCompare(b.companyName),
    status: () => STATUS_RANK[a.status] - STATUS_RANK[b.status],
    submitted: () => a.submittedAt - b.submittedAt,
    compensation: () => a.fixedFeeCents - b.fixedFeeCents || a.cpmRateCents - b.cpmRateCents,
  }[sort.key]();
  if (primary !== 0) return sort.direction === "ascending" ? primary : -primary;
  // Ties fall back to newest first in either direction, so the order is stable.
  return b.submittedAt - a.submittedAt || a.applicationId.localeCompare(b.applicationId);
}

/**
 * Returns one page of the requested tab of the creator's applications, with
 * search, filters, sorting and a count for each tab. Offers sort by expiry
 * soonest first unless told otherwise; Applications by newest submitted;
 * Accepted by most recently accepted, rows without `offerAcceptedAt` last.
 * `hideRejected` also hides applications closed because the opportunity filled,
 * and the status sort groups them with rejected ones. It does nothing on Offers
 * or Accepted. The result echoes `tab`.
 *
 * Reads at most `MAX_APPLICATIONS_READ` applications per count (shared across a
 * tab's statuses, newest first) and filters, sorts and pages them in memory, so
 * a tab holding more reports `isCapped`. Counts ignore the search and filters;
 * the requested tab's count is its joined rows (deleted opportunities skipped),
 * the other tabs' counts are the raw rows read.
 * Rows keep their opportunity and company details after the opportunity closes;
 * `canStar` says whether starring is still possible. Applications whose
 * opportunity no longer exists are skipped.
 *
 * @param options.limit overrides `MAX_APPLICATIONS_READ`, for tests.
 * @throws `invalid_state` with `invalid_page`, `invalid_page_size` or
 * `search_too_long` for arguments outside their bounds.
 */
export async function listApplicationRows(
  ctx: QueryCtx,
  creatorId: Id<"creators">,
  args: ApplicationSearch,
  options: { limit?: number } = {},
): Promise<Infer<typeof applicationSearchResult>> {
  const limit = options.limit ?? MAX_APPLICATIONS_READ;
  const search = (args.search ?? "").trim();
  if (!Number.isInteger(args.page) || args.page < 1) {
    throw apiError("invalid_state", { reason: "invalid_page" });
  }
  if (!Number.isInteger(args.pageSize) || args.pageSize < 1 || args.pageSize > MAX_PAGE_SIZE) {
    throw apiError("invalid_state", { reason: "invalid_page_size" });
  }
  if (search.length > MAX_SEARCH_LENGTH) {
    throw apiError("invalid_state", { reason: "search_too_long" });
  }

  const [applicationsRead, offersRead, acceptedRead] = await Promise.all([
    readTabApplications(ctx, creatorId, APPLICATION_TAB_STATUSES.applications, limit),
    readTabApplications(ctx, creatorId, APPLICATION_TAB_STATUSES.offers, limit),
    readTabApplications(ctx, creatorId, APPLICATION_TAB_STATUSES.accepted, limit),
  ]);

  const reads = {
    applications: applicationsRead,
    offers: offersRead,
    accepted: acceptedRead,
  };
  const tab = reads[args.tab];

  const companies = new Map<Id<"companies">, Doc<"companies"> | null>();
  const joined: ApplicationRow[] = [];
  for (const application of tab.applications) {
    const opportunity = await ctx.db.get("opportunities", application.opportunityId);
    // The opportunity was deleted, so there is nothing to show for this application.
    if (opportunity === null) continue;
    if (!companies.has(opportunity.companyId)) {
      companies.set(opportunity.companyId, await ctx.db.get("companies", opportunity.companyId));
    }
    const company = companies.get(opportunity.companyId) ?? null;
    joined.push({
      applicationId: application._id,
      opportunityId: opportunity._id,
      // The tab's statuses are all row statuses; the index read cannot say so.
      status: application.status as Infer<typeof applicationRowStatus>,
      submittedAt: application._creationTime,
      ...(application.offerExpiresAt === undefined
        ? {}
        : { offerExpiresAt: application.offerExpiresAt }),
      ...(application.offerAcceptedAt === undefined
        ? {}
        : { offerAcceptedAt: application.offerAcceptedAt }),
      title: opportunity.title,
      companyName: company?.name ?? "",
      ...(company?.profilePictureMediaId === undefined
        ? {}
        : { companyLogoMediaId: company.profilePictureMediaId }),
      fixedFeeCents: opportunity.fixedFeeCents,
      cpmRateCents: opportunity.cpmRateCents,
      paymentCapCents: opportunity.paymentCapCents,
      isStarred: false,
      canStar: false,
    });
  }

  const needle = search.toLowerCase();
  let rows = joined.filter(
    (row) =>
      needle === "" ||
      row.title.toLowerCase().includes(needle) ||
      row.companyName.toLowerCase().includes(needle),
  );
  let starredIds: Set<Id<"opportunities">> | null = null;
  if (args.starred) {
    starredIds = await listStarredOpportunityIds(
      ctx,
      creatorId,
      rows.map((row) => row.opportunityId),
    );
    rows = rows.filter((row) => starredIds!.has(row.opportunityId));
  }
  if (args.hideRejected) {
    rows = rows.filter((row) => row.status !== "rejected" && row.status !== "opportunityFull");
  }

  const sort = args.sort ?? DEFAULT_SORT_BY_TAB[args.tab];
  rows.sort((a, b) => compareRows(a, b, sort));

  const totalCount = rows.length;
  const pageCount = Math.ceil(totalCount / args.pageSize);
  const page = Math.min(args.page, Math.max(pageCount, 1));
  const pageRows = rows.slice((page - 1) * args.pageSize, page * args.pageSize);

  starredIds ??= await listStarredOpportunityIds(
    ctx,
    creatorId,
    pageRows.map((row) => row.opportunityId),
  );
  const visible = await Promise.all(
    pageRows.map(async (row) => {
      const opportunity = await ctx.db.get("opportunities", row.opportunityId);
      return (
        opportunity !== null && (await getVisibleOpportunityCompany(ctx, opportunity)) !== null
      );
    }),
  );

  const rawCount = (read: { applications: unknown[]; isCapped: boolean }) => ({
    count: read.applications.length,
    isCapped: read.isCapped,
  });
  return {
    tab: args.tab,
    rows: pageRows.map((row, i) => ({
      ...row,
      isStarred: starredIds.has(row.opportunityId),
      canStar: visible[i],
    })),
    page,
    pageSize: args.pageSize,
    totalCount,
    pageCount,
    counts: {
      applications:
        args.tab === "applications"
          ? { count: joined.length, isCapped: tab.isCapped }
          : rawCount(applicationsRead),
      offers:
        args.tab === "offers"
          ? { count: joined.length, isCapped: tab.isCapped }
          : rawCount(offersRead),
      accepted:
        args.tab === "accepted"
          ? { count: joined.length, isCapped: tab.isCapped }
          : rawCount(acceptedRead),
    },
  };
}

export const applicationDetail = v.object({
  applicationId: v.id("applications"),
  status: applicationStatus,
  submittedAt: v.number(),
  offerExpiresAt: v.optional(v.number()),
  offerAcceptedAt: v.optional(v.number()),
  opportunity: creatorOpportunity,
  companyLogoMediaId: v.optional(v.id("mediaUploads")),
  minFollowerRange: v.optional(followerRange),
  canAccept: v.boolean(),
  canDecline: v.boolean(),
  acceptBlockedReason: v.optional(
    v.union(v.literal("opportunity_closed"), v.literal("opportunity_full")),
  ),
});
export type ApplicationDetail = Infer<typeof applicationDetail>;

/**
 * Why accepting an offer on this opportunity would be refused, or null. Keep in
 * sync with the checks in `createAssignmentFromOffer`, which stays the authority.
 */
function offerAcceptBlockedReason(
  opportunity: Pick<Doc<"opportunities">, "status" | "numFilledSlots" | "maxSlots">,
): "opportunity_closed" | "opportunity_full" | null {
  if (opportunity.status !== "open" && opportunity.status !== "paused") {
    return "opportunity_closed";
  }
  if (opportunity.numFilledSlots >= opportunity.maxSlots) return "opportunity_full";
  return null;
}

/**
 * Returns one of the creator's applications with its opportunity brief, for the
 * offer details. Works for any status, and for closed, paused or inactive-company
 * opportunities, because the creator already holds the application.
 *
 * `canAccept` and `canDecline` leave the clock out on purpose: queries must not
 * read `Date.now()`, so the client compares `offerExpiresAt` to its own time and
 * `acceptApplication` refuses an expired offer regardless.
 *
 * @throws `not_found` if the application does not exist, is not the creator's,
 * or its opportunity was deleted.
 */
export async function requireApplicationDetail(
  ctx: QueryCtx,
  creatorId: Id<"creators">,
  applicationId: Id<"applications">,
): Promise<ApplicationDetail> {
  const application = await requireApplication(ctx, { role: "creator", creatorId }, applicationId);
  const opportunity = await ctx.db.get("opportunities", application.opportunityId);
  if (opportunity === null) {
    throw apiError("not_found", { resource: "application" });
  }
  const company = await ctx.db.get("companies", opportunity.companyId);
  const view = await getOpportunityView(ctx, opportunity);
  const blockedReason = offerAcceptBlockedReason(opportunity);
  const isOffered = application.status === "offered";
  return {
    applicationId: application._id,
    status: application.status,
    submittedAt: application._creationTime,
    ...(application.offerExpiresAt === undefined
      ? {}
      : { offerExpiresAt: application.offerExpiresAt }),
    ...(application.offerAcceptedAt === undefined
      ? {}
      : { offerAcceptedAt: application.offerAcceptedAt }),
    opportunity: toCreatorOpportunity(opportunity, company ?? { name: "" }, view),
    ...(company?.profilePictureMediaId === undefined
      ? {}
      : { companyLogoMediaId: company.profilePictureMediaId }),
    ...(opportunity.minFollowerRange === undefined
      ? {}
      : { minFollowerRange: opportunity.minFollowerRange }),
    canAccept: isOffered && blockedReason === null,
    canDecline: isOffered,
    ...(isOffered && blockedReason !== null ? { acceptBlockedReason: blockedReason } : {}),
  };
}

/**
 * Returns one page of applications to an opportunity the company owns,
 * optionally filtered by status. Results are ordered by status, then newest
 * first within each status.
 *
 * @throws `not_found` if the opportunity does not exist or belongs to another
 * company.
 */
export async function listApplicationsByOpportunityId(
  ctx: QueryCtx,
  companyId: Id<"companies">,
  options: {
    opportunityId: Id<"opportunities">;
    status?: Infer<typeof applicationStatus>;
    paginationOpts: PaginationOptions;
  },
): Promise<PaginationResult<Doc<"applications">>> {
  const { opportunityId, status } = options;
  const opportunity = await ctx.db.get("opportunities", opportunityId);
  const campaign = opportunity && (await ctx.db.get("campaigns", opportunity.campaignId));
  if (!campaign || campaign.companyId !== companyId) {
    throw apiError("not_found", { resource: "opportunity" });
  }
  return await ctx.db
    .query("applications")
    .withIndex("by_opportunityId_and_status", (q) =>
      status === undefined
        ? q.eq("opportunityId", opportunityId)
        : q.eq("opportunityId", opportunityId).eq("status", status),
    )
    .order("desc")
    .paginate(options.paginationOpts);
}

/** How long an offer stays open when the company does not choose an expiry. */
export const DEFAULT_OFFER_DURATION_MS = 48 * 60 * 60 * 1000;

/**
 * Sends an offer on a pending application to one of the company's
 * opportunities. Offers are not capped by open slots: the first creators to
 * accept take them.
 *
 * @throws `not_found` if the application does not exist or belongs to another
 * company.
 * The default expiry is 48 hours, rounded up to the next :00 or :30 UTC. A
 * company-chosen expiry must already be on :00 or :30; it is refused rather
 * than rounded, like opportunity deadlines.
 *
 * @throws `invalid_state` if the application is not pending, the opportunity or
 * its campaign is not open, or `offerExpiresAt` is not a future :00/:30 UTC time.
 */
export async function offerApplication(
  ctx: MutationCtx,
  companyId: Id<"companies">,
  applicationId: Id<"applications">,
  requestedExpiresAt?: number,
): Promise<Doc<"applications">> {
  const application = await requirePendingForReview(ctx, companyId, applicationId);
  const now = Date.now();
  const offerExpiresAt =
    requestedExpiresAt ??
    Math.ceil((now + DEFAULT_OFFER_DURATION_MS) / HALF_HOUR_MS) * HALF_HOUR_MS;
  if (!isHalfHourTimestamp(offerExpiresAt) || offerExpiresAt <= now) {
    throw apiError("invalid_state", { reason: "invalid_offer_expiry" });
  }

  const patch = {
    status: "offered" as const,
    statusLastUpdatedAt: now,
    offerExpiresAt,
  };
  await ctx.db.patch("applications", application._id, patch);
  const opportunity = await ctx.db.get("opportunities", application.opportunityId);
  if (opportunity !== null) {
    await notifyCreator(ctx, application.creatorId, {
      type: "applicationOffered",
      title: `You received an offer for ${opportunity.title}`,
      target: applicationTarget(application),
    });
  }
  return { ...application, ...patch };
}

/**
 * Rejects a pending application to one of the company's opportunities.
 *
 * @throws `not_found` if the application does not exist or belongs to another
 * company.
 * @throws `invalid_state` if the application is not pending or the opportunity
 * or its campaign is not open.
 */
export async function rejectApplication(
  ctx: MutationCtx,
  companyId: Id<"companies">,
  applicationId: Id<"applications">,
): Promise<Doc<"applications">> {
  const application = await requirePendingForReview(ctx, companyId, applicationId);
  const patch = {
    status: "rejected" as const,
    statusLastUpdatedAt: Date.now(),
  };
  await ctx.db.patch("applications", application._id, patch);
  const opportunity = await ctx.db.get("opportunities", application.opportunityId);
  if (opportunity !== null) {
    await notifyCreator(ctx, application.creatorId, {
      type: "applicationRejected",
      title: `Your application for ${opportunity.title} wasn't accepted`,
      target: applicationTarget(application),
    });
  }
  return { ...application, ...patch };
}

/** Loads a pending application the company may review while it is open. */
async function requirePendingForReview(
  ctx: MutationCtx,
  companyId: Id<"companies">,
  applicationId: Id<"applications">,
): Promise<Doc<"applications">> {
  const application = await requireApplication(ctx, { role: "company", companyId }, applicationId);
  if (application.status !== "pending") {
    throw apiError("invalid_state", { reason: "application_not_pending" });
  }
  const opportunity = await ctx.db.get("opportunities", application.opportunityId);
  if (opportunity === null) {
    throw apiError("not_found", { resource: "application" });
  }
  await requireOpportunityOpen(ctx, opportunity);
  return application;
}

/**
 * Accepts the creator's own unexpired offer. In one transaction this creates
 * the assignment through `createAssignmentFromOffer` (which takes a slot), and,
 * if that was the last slot, enqueues the sweep that marks every remaining
 * pending or offered application as `opportunityFull`. That sweep runs in its
 * own transactions, so the statuses and notices land shortly after; the slot
 * guard in `createAssignmentFromOffer` is what prevents an extra assignment.
 * Offers can be accepted while the opportunity is paused.
 *
 * Two creators accepting the last slot at once both read the opportunity, so
 * Convex retries one, which then sees the slot is taken.
 *
 * @throws `not_found` if the application does not exist or is not the
 * creator's.
 * @throws `invalid_state` if the application has no offer, the offer has
 * expired, the opportunity is closed, or every slot is filled.
 * @throws `conflict` if the creator already has an assignment on it.
 */
export async function acceptApplication(
  ctx: MutationCtx,
  creatorId: Id<"creators">,
  applicationId: Id<"applications">,
): Promise<Doc<"applications">> {
  const application = await requireOfferedApplication(ctx, creatorId, applicationId);
  const now = Date.now();
  if (application.offerExpiresAt === undefined || application.offerExpiresAt <= now) {
    throw apiError("invalid_state", { reason: "offer_expired" });
  }
  const opportunity = await ctx.db.get("opportunities", application.opportunityId);
  if (opportunity === null) {
    throw apiError("not_found", { resource: "application" });
  }

  // Refuses a closed opportunity or a full one, then takes the slot and creates
  // the termsPending assignment with the opportunity's current terms.
  const assignmentId = await createAssignmentFromOffer(ctx, {
    opportunityId: opportunity._id,
    creatorId,
  });
  const patch = {
    status: "accepted" as const,
    offerAcceptedAt: now,
    statusLastUpdatedAt: now,
  };
  await ctx.db.patch("applications", application._id, patch);
  await notifyCompanyUser(ctx, opportunity.createdBy, {
    type: "applicationAccepted",
    title: `${await creatorName(ctx, creatorId)} accepted your offer for ${opportunity.title}`,
    target: assignmentTarget(assignmentId),
  });
  if (opportunity.numFilledSlots + 1 >= opportunity.maxSlots) {
    await ctx.scheduler.runAfter(0, internal.applications.markFull, {
      opportunityId: opportunity._id,
    });
  }
  return { ...application, ...patch };
}

/**
 * Declines the creator's own offer. Allowed whatever the opportunity's status,
 * since saying no never takes a slot.
 *
 * @throws `not_found` if the application does not exist or is not the
 * creator's.
 * @throws `invalid_state` if the application has no offer.
 */
export async function declineApplication(
  ctx: MutationCtx,
  creatorId: Id<"creators">,
  applicationId: Id<"applications">,
): Promise<Doc<"applications">> {
  const application = await requireOfferedApplication(ctx, creatorId, applicationId);
  const patch = {
    status: "declined" as const,
    statusLastUpdatedAt: Date.now(),
  };
  await ctx.db.patch("applications", application._id, patch);
  const opportunity = await ctx.db.get("opportunities", application.opportunityId);
  if (opportunity !== null) {
    await notifyCompanyUser(ctx, opportunity.createdBy, {
      type: "applicationDeclined",
      title: `${await creatorName(ctx, creatorId)} declined your offer for ${opportunity.title}`,
      target: applicationTarget(application),
    });
  }
  return { ...application, ...patch };
}

/** Loads the creator's own application and requires it to hold an offer. */
async function requireOfferedApplication(
  ctx: MutationCtx,
  creatorId: Id<"creators">,
  applicationId: Id<"applications">,
): Promise<Doc<"applications">> {
  const application = await requireApplication(ctx, { role: "creator", creatorId }, applicationId);
  if (application.status !== "offered") {
    throw apiError("invalid_state", { reason: "application_not_offered" });
  }
  return application;
}

/**
 * Marks one bounded batch of the opportunity's pending or offered applications
 * as `opportunityFull`, tells each creator, and reports whether more may
 * remain. There is no cap on applications, so the sweep runs a batch at a time
 * and `internal.applications.markFull` reschedules itself until it is done.
 *
 * Each batch rechecks that the opportunity is still full, so a slot freed
 * part-way through stops the rest of the sweep. Rows an earlier batch already
 * marked keep that status; reopening them is a separate decision.
 *
 * It needs no cursor: every row it patches leaves the `pending` and `offered`
 * ranges, so the next batch reads the next rows. That also makes a retry
 * harmless, since a reread cannot see a row this transaction already patched
 * and notified.
 */
export async function markApplicationsFullBatch(
  ctx: MutationCtx,
  opportunityId: Id<"opportunities">,
): Promise<boolean> {
  const opportunity = await ctx.db.get("opportunities", opportunityId);
  if (opportunity === null) return false;
  // Rechecked every batch: a creator who declines terms between batches frees
  // their slot, and the applications still waiting are no longer shut out.
  if (opportunity.numFilledSlots < opportunity.maxSlots) return false;
  const now = Date.now();
  let budget = APPLICATION_SWEEP_BATCH;
  for (const status of ["pending", "offered"] as const) {
    if (budget === 0) return true;
    const remaining = await ctx.db
      .query("applications")
      .withIndex("by_opportunityId_and_status", (q) =>
        q.eq("opportunityId", opportunityId).eq("status", status),
      )
      .take(budget);
    budget -= remaining.length;
    for (const application of remaining) {
      await ctx.db.patch("applications", application._id, {
        status: "opportunityFull",
        statusLastUpdatedAt: now,
      });
      await notifyCreator(ctx, application.creatorId, {
        type: "applicationOpportunityFull",
        title: `${opportunity.title} has filled all its slots`,
        target: applicationTarget(application),
      });
    }
  }
  return budget === 0;
}

/**
 * Marks one bounded batch of offers past their expiry as `offerExpired`,
 * notifies the creator and the opportunity's creator, and reports whether more
 * may remain. `acceptApplication` already refuses expired
 * offers, so this only makes the status visible.
 */
export async function expireApplicationOffers(ctx: MutationCtx): Promise<boolean> {
  const batchSize = 100;
  const now = Date.now();
  const expired = await ctx.db
    .query("applications")
    .withIndex("by_status_and_offerExpiresAt", (q) =>
      q.eq("status", "offered").lte("offerExpiresAt", now),
    )
    .take(batchSize);
  for (const application of expired) {
    await ctx.db.patch("applications", application._id, {
      status: "offerExpired",
      statusLastUpdatedAt: now,
    });
    const opportunity = await ctx.db.get("opportunities", application.opportunityId);
    if (opportunity === null) continue;
    const target = applicationTarget(application);
    await notifyCreator(ctx, application.creatorId, {
      type: "applicationOfferExpired",
      title: `Your offer for ${opportunity.title} expired`,
      target,
    });
    await notifyCompanyUser(ctx, opportunity.createdBy, {
      type: "applicationOfferExpired",
      title: `${await creatorName(ctx, application.creatorId)}'s offer for ${opportunity.title} expired unanswered`,
      target,
    });
  }
  return expired.length === batchSize;
}
