import { paginationOptsValidator, type PaginationResult } from "convex/server";
import { v, type Infer } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { stream } from "convex-helpers/server/stream";
import { apiError } from "../lib/errors";
import { requireUrl } from "../lib/urls";
import { withRowsReadCap } from "../lib/pagination";
import { requireNonBlank, isHalfHourTimestamp } from "../lib/validation";
import { APPLICATION_SWEEP_BATCH } from "./applications";
import { requireMembership } from "./companyUsers";
import {
  deliverableCreate,
  hasDeliverables,
  requireAiReviewCriteria,
  insertDeliverables,
  listOpportunityDeliverables,
} from "./deliverableDrafts";
import { notifyCompanyUser, notifyCreator } from "./notifications";
import { requireNiche } from "./niches";
import {
  hasOpportunityNiche,
  listOpportunityNiches,
  updateOpportunityNiches,
} from "./opportunityNiches";
import { listOpportunityLanguages, updateOpportunityLanguages } from "./opportunityLanguages";
import { listOpportunitySkills, updateOpportunitySkills } from "./opportunitySkills";
import schema from "../schema";
import { followerRange } from "../schemas/creators.schema";

export const opportunityCreate = schema
  .doc("opportunities")
  .omit("_id", "_creationTime", "companyId", "createdBy", "numFilledSlots", "status")
  .extend({
    status: v.union(v.literal("draft"), v.literal("open")),
    // Required to create it open; a draft can get them later through `deliverables.create`.
    deliverables: v.optional(v.array(deliverableCreate)),
    // Selections are association rows, not columns, so they are inputs of their own.
    niches: v.optional(v.array(v.string())),
    skills: v.optional(v.array(v.string())),
    languages: v.optional(v.array(v.string())),
  });

export type OpportunityCreate = Infer<typeof opportunityCreate>;

export const opportunityView = schema.doc("opportunities").extend({
  niches: v.array(v.string()),
  skills: v.array(v.string()),
  languages: v.array(v.string()),
});
export type OpportunityView = Infer<typeof opportunityView>;

/** Joins bounded selections onto an already-authorized opportunity document. */
export async function getOpportunityView(
  ctx: QueryCtx | MutationCtx,
  opportunity: Doc<"opportunities">,
): Promise<OpportunityView> {
  const [niches, skills, languages] = await Promise.all([
    listOpportunityNiches(ctx, opportunity._id),
    listOpportunitySkills(ctx, opportunity._id),
    listOpportunityLanguages(ctx, opportunity._id),
  ]);
  return { ...opportunity, niches, skills, languages };
}

// Allowlist creator fields so new stored fields do not become public by default.
export const creatorOpportunity = schema
  .doc("opportunities")
  .pick(
    "_id",
    "_creationTime",
    "title",
    "description",
    "isGated",
    "usesAiReviewDefault",
    "maxSlots",
    "numFilledSlots",
    "deadline",
    "status",
    "fixedFeeCents",
    "cpmRateCents",
    "paymentCapCents",
    "contentRequirements",
    "reviewPolicy",
  )
  .extend({
    companyName: v.string(),
    niches: v.array(v.string()),
    skills: v.array(v.string()),
    languages: v.array(v.string()),
  });

export type CreatorOpportunity = Infer<typeof creatorOpportunity>;

/** Builds the allowlisted creator-facing brief from an opportunity and its company. */
export function toCreatorOpportunity(
  opportunity: Doc<"opportunities">,
  company: Doc<"companies">,
  selections: Pick<OpportunityView, "niches" | "skills" | "languages">,
): CreatorOpportunity {
  return {
    _id: opportunity._id,
    _creationTime: opportunity._creationTime,
    title: opportunity.title,
    description: opportunity.description,
    isGated: opportunity.isGated,
    usesAiReviewDefault: opportunity.usesAiReviewDefault,
    maxSlots: opportunity.maxSlots,
    numFilledSlots: opportunity.numFilledSlots,
    deadline: opportunity.deadline,
    status: opportunity.status,
    fixedFeeCents: opportunity.fixedFeeCents,
    cpmRateCents: opportunity.cpmRateCents,
    paymentCapCents: opportunity.paymentCapCents,
    contentRequirements: opportunity.contentRequirements,
    reviewPolicy: opportunity.reviewPolicy,
    companyName: company.name,
    niches: selections.niches,
    skills: selections.skills,
    languages: selections.languages,
  };
}

/** Returns a role-appropriate opportunity response after enforcing visibility. */
export async function getOpportunity(
  ctx: QueryCtx,
  opportunityId: Id<"opportunities">,
  caller: { user: Doc<"users">; orgId: string | null },
): Promise<OpportunityView | CreatorOpportunity> {
  const opportunity = await requireOpportunity(ctx, opportunityId, caller);
  if (caller.user.role === "company" || caller.user.role === "operator")
    return await getOpportunityView(ctx, opportunity);

  const company = await ctx.db.get("companies", opportunity.companyId);
  if (company === null) {
    throw apiError("not_found", { resource: "opportunity" });
  }
  return toCreatorOpportunity(opportunity, company, await getOpportunityView(ctx, opportunity));
}

// Deliverables change through the `deliverables` routes.
export const opportunityUpdate = opportunityCreate
  .omit("campaignId", "status", "productAccessLink", "minFollowerRange", "deliverables")
  .partial()
  .extend({
    productAccessLink: v.optional(v.union(v.string(), v.null())),
    minFollowerRange: v.optional(v.union(followerRange, v.null())),
  });

export type OpportunityUpdate = Infer<typeof opportunityUpdate>;

/** Requires an exact UTC :00 or :30 deadline with zero seconds and milliseconds. */
function validateOpportunityDeadline(deadline: number): void {
  if (!isHalfHourTimestamp(deadline)) {
    throw apiError("invalid_state", { reason: "invalid_deadline" });
  }
}

/** Applies the shared, idempotent close transition without rewriting workflow records. */
async function applyOpportunityClose(
  ctx: MutationCtx,
  opportunity: Doc<"opportunities">,
): Promise<Doc<"opportunities">> {
  if (opportunity.status === "closed") return opportunity;
  await ctx.db.patch("opportunities", opportunity._id, { status: "closed" });
  // Enqueued rather than inline: the deadline cron closes up to 50 opportunities
  // in one transaction, and an opportunity's applications are unbounded.
  await ctx.scheduler.runAfter(0, internal.opportunities.notifyClosed, {
    opportunityId: opportunity._id,
    cursor: null,
  });
  return { ...opportunity, status: "closed" };
}

/**
 * Tells one bounded batch of creators with a pending or offered application
 * that the opportunity closed, since neither can go further. Returns the
 * cursor to continue from, or `null` when the batch was the last one.
 *
 * Unlike the full sweep this leaves the applications alone, so it cannot
 * advance by status and pages by cursor instead. It walks every application on
 * the opportunity and skips the ones that are already resolved; the cursor is
 * stable because nothing here writes to an indexed field. A continuation that
 * fails and runs again can renotify its own page, which is why the close
 * notice has to stay safe to deliver more than once.
 */
export async function notifyWaitingApplicantsBatch(
  ctx: MutationCtx,
  opportunityId: Id<"opportunities">,
  cursor: string | null,
): Promise<string | null> {
  const opportunity = await ctx.db.get("opportunities", opportunityId);
  if (opportunity === null) return null;
  const page = await ctx.db
    .query("applications")
    .withIndex("by_opportunityId_and_status", (q) => q.eq("opportunityId", opportunityId))
    .paginate({ numItems: APPLICATION_SWEEP_BATCH, cursor });
  for (const application of page.page) {
    if (application.status !== "pending" && application.status !== "offered") continue;
    await notifyCreator(ctx, application.creatorId, {
      type: "applicationOpportunityClosed",
      title: `${opportunity.title} has closed`,
      target: {
        kind: "application",
        applicationId: application._id,
        opportunityId,
      },
    });
  }
  return page.isDone ? null : page.continueCursor;
}

/** Permanently closes an owned published opportunity, preserving existing commitments. */
export async function closeOpportunity(
  ctx: MutationCtx,
  membership: Doc<"companyUsers">,
  opportunityId: Id<"opportunities">,
): Promise<Doc<"opportunities">> {
  const { opportunity } = await requireOwnedOpportunity(ctx, membership, opportunityId);
  if (opportunity.status === "draft") {
    throw apiError("invalid_state", { reason: "opportunity_not_published" });
  }
  return await applyOpportunityClose(ctx, opportunity);
}

/** Closes a bounded batch of overdue published opportunities, returning them and whether more may remain. */
export async function closeExpiredOpportunities(
  ctx: MutationCtx,
): Promise<{ closedIds: Id<"opportunities">[]; hasMore: boolean }> {
  const now = Date.now();
  const batchSize = 50;
  const closedIds: Id<"opportunities">[] = [];
  let hasMore = false;
  for (const status of ["open", "paused"] as const) {
    const opportunities = await ctx.db
      .query("opportunities")
      .withIndex("by_status_and_deadline", (q) => q.eq("status", status).lte("deadline", now))
      .take(batchSize);
    for (const opportunity of opportunities) {
      await applyOpportunityClose(ctx, opportunity);
      closedIds.push(opportunity._id);
      // A manual close is the company's own action; only the deadline close is news to them.
      await notifyCompanyUser(ctx, opportunity.createdBy, {
        type: "opportunityClosed",
        title: `${opportunity.title} closed at its deadline`,
        target: { kind: "opportunity", opportunityId: opportunity._id },
      });
    }
    hasMore ||= opportunities.length === batchSize;
  }
  return { closedIds, hasMore };
}

/** Loads an owned opportunity and its campaign for company lifecycle transitions. */
export async function requireOwnedOpportunity(
  ctx: MutationCtx,
  membership: Doc<"companyUsers">,
  opportunityId: Id<"opportunities">,
): Promise<{ opportunity: Doc<"opportunities">; campaign: Doc<"campaigns"> }> {
  const opportunity = await ctx.db.get("opportunities", opportunityId);
  if (opportunity === null || opportunity.companyId !== membership.companyId) {
    throw apiError("not_found", { resource: "opportunity" });
  }
  const campaign = await ctx.db.get("campaigns", opportunity.campaignId);
  const company = await ctx.db.get("companies", opportunity.companyId);
  if (
    campaign === null ||
    campaign.companyId !== opportunity.companyId ||
    company === null ||
    !company.isActive
  ) {
    throw apiError("not_found", { resource: "opportunity" });
  }
  return { opportunity, campaign };
}

/** Loads an owned opportunity whose brief may change: neither it nor its campaign is closed, and it hasn't expired. */
export async function requireEditableOpportunity(
  ctx: MutationCtx,
  membership: Doc<"companyUsers">,
  opportunityId: Id<"opportunities">,
): Promise<{ opportunity: Doc<"opportunities">; campaign: Doc<"campaigns"> }> {
  const { opportunity, campaign } = await requireOwnedOpportunity(ctx, membership, opportunityId);
  if (opportunity.status === "closed" || campaign.status === "closed") {
    throw apiError("invalid_state", { reason: "opportunity_not_editable" });
  }
  // Deadline closure is permanent even during the interval before the cron materializes it.
  if (opportunity.status !== "draft" && opportunity.deadline <= Date.now()) {
    throw apiError("invalid_state", { reason: "opportunity_expired" });
  }
  return { opportunity, campaign };
}

/** Shared pause transition; callers must first authorize the scope and verify the opportunity is open. */
export async function applyOpportunityPause(
  ctx: MutationCtx,
  opportunity: Doc<"opportunities">,
): Promise<Doc<"opportunities">> {
  await ctx.db.patch("opportunities", opportunity._id, { status: "paused" });
  return { ...opportunity, status: "paused" };
}

/** Pauses an owned open opportunity without changing its existing workflow records. */
export async function pauseOpportunity(
  ctx: MutationCtx,
  membership: Doc<"companyUsers">,
  opportunityId: Id<"opportunities">,
): Promise<Doc<"opportunities">> {
  const { opportunity, campaign } = await requireOwnedOpportunity(ctx, membership, opportunityId);
  if (opportunity.status !== "open") {
    throw apiError("invalid_state", { reason: "opportunity_not_open" });
  }
  if (campaign.status === "closed") {
    throw apiError("invalid_state", { reason: "campaign_closed" });
  }
  return await applyOpportunityPause(ctx, opportunity);
}

/** Resumes an owned paused opportunity without altering its campaign or agreed terms. */
export async function resumeOpportunity(
  ctx: MutationCtx,
  membership: Doc<"companyUsers">,
  opportunityId: Id<"opportunities">,
): Promise<Doc<"opportunities">> {
  const { opportunity, campaign } = await requireOwnedOpportunity(ctx, membership, opportunityId);
  if (opportunity.status !== "paused") {
    throw apiError("invalid_state", { reason: "opportunity_not_paused" });
  }
  // Campaign and opportunity pause state are independent; resuming one cannot resume the other.
  if (campaign.status !== "open") {
    throw apiError("invalid_state", { reason: "campaign_not_open" });
  }
  validateOpportunityDeadline(opportunity.deadline);
  if (opportunity.deadline <= Date.now()) {
    throw apiError("invalid_state", { reason: "invalid_deadline" });
  }
  if (opportunity.usesAiReviewDefault) {
    requireAiReviewCriteria(true, await listOpportunityDeliverables(ctx, opportunityId));
  }
  await ctx.db.patch("opportunities", opportunityId, { status: "open" });
  return { ...opportunity, status: "open" };
}

/** Publishes an owned draft after validating its brief and parent campaign. */
export async function publishOpportunity(
  ctx: MutationCtx,
  membership: Doc<"companyUsers">,
  opportunityId: Id<"opportunities">,
): Promise<Doc<"opportunities">> {
  const { opportunity, campaign } = await requireOwnedOpportunity(ctx, membership, opportunityId);
  if (opportunity.status !== "draft") {
    throw apiError("invalid_state", { reason: "opportunity_not_draft" });
  }
  if (campaign.status !== "open") {
    throw apiError("invalid_state", { reason: "campaign_not_open" });
  }
  if (!(await hasDeliverables(ctx, opportunityId))) {
    throw apiError("invalid_state", { reason: "deliverables_required" });
  }
  // Validate the target state so a deadline allowed on a draft must still be future at publication.
  const normalized = validateOpportunityFields({ ...opportunity, status: "open" });
  if (campaign.endsAt !== undefined && opportunity.deadline > campaign.endsAt) {
    throw apiError("invalid_state", { reason: "deadline_after_campaign_end" });
  }
  if (opportunity.usesAiReviewDefault) {
    requireAiReviewCriteria(true, await listOpportunityDeliverables(ctx, opportunityId));
  }
  await ctx.db.patch("opportunities", opportunityId, { status: "open", ...normalized });
  return { ...opportunity, status: "open", ...normalized };
}

/** Removes an owned, unused draft without cascading into workflow history. */
export async function removeOpportunity(
  ctx: MutationCtx,
  membership: Doc<"companyUsers">,
  opportunityId: Id<"opportunities">,
): Promise<void> {
  const { opportunity } = await requireOwnedOpportunity(ctx, membership, opportunityId);
  if (opportunity.status !== "draft" || opportunity.numFilledSlots !== 0) {
    throw apiError("invalid_state", { reason: "opportunity_not_removable" });
  }
  // Check all statuses: historical applications and assignments must not become orphaned.
  const applications = await ctx.db
    .query("applications")
    .withIndex("by_opportunityId_and_status", (q) => q.eq("opportunityId", opportunityId))
    .take(1);
  const assignments = await ctx.db
    .query("assignments")
    .withIndex("by_opportunityId_and_status", (q) => q.eq("opportunityId", opportunityId))
    .take(1);
  if (applications.length > 0 || assignments.length > 0) {
    throw apiError("invalid_state", { reason: "opportunity_has_workflow_history" });
  }
  // Deliverables are part of the brief, not workflow history, so they go with it.
  for (const deliverable of await listOpportunityDeliverables(ctx, opportunityId)) {
    await ctx.db.delete("deliverables", deliverable._id);
  }
  await updateOpportunityNiches(ctx, opportunityId, []);
  await updateOpportunitySkills(ctx, opportunityId, []);
  await updateOpportunityLanguages(ctx, opportunityId, []);
  await ctx.db.delete("opportunities", opportunityId);
}

/** Updates an owned brief and its defaults without changing existing assignment terms. */
export async function updateOpportunity(
  ctx: MutationCtx,
  membership: Doc<"companyUsers">,
  opportunityId: Id<"opportunities">,
  updates: OpportunityUpdate,
): Promise<OpportunityView> {
  const { opportunity, campaign } = await requireEditableOpportunity(
    ctx,
    membership,
    opportunityId,
  );

  const patch: Partial<OpportunityCreate> = {};
  for (const field of ["title", "description", "contentRequirements", "reviewPolicy"] as const) {
    if (updates[field] !== undefined) patch[field] = updates[field];
  }
  for (const field of [
    "maxSlots",
    "deadline",
    "fixedFeeCents",
    "cpmRateCents",
    "paymentCapCents",
  ] as const) {
    if (updates[field] !== undefined) patch[field] = updates[field];
  }
  for (const field of ["isGated", "usesAiReviewDefault"] as const) {
    if (updates[field] !== undefined) patch[field] = updates[field];
  }
  // Omitted fields stay unchanged; null removes the optional link, as in creator updates.
  if (updates.productAccessLink !== undefined) {
    patch.productAccessLink =
      updates.productAccessLink === null
        ? undefined
        : requireUrl(updates.productAccessLink, { reason: "invalid_product_access_link" });
  }
  if (updates.minFollowerRange !== undefined) {
    patch.minFollowerRange = updates.minFollowerRange ?? undefined;
  }
  const updated = { ...opportunity, ...patch };
  if (updated.usesAiReviewDefault) {
    requireAiReviewCriteria(true, await listOpportunityDeliverables(ctx, opportunityId));
  }
  const normalized = validateOpportunityFields(updated);
  if (campaign.endsAt !== undefined && updated.deadline > campaign.endsAt) {
    throw apiError("invalid_state", { reason: "deadline_after_campaign_end" });
  }
  if (updated.maxSlots < opportunity.numFilledSlots) {
    throw apiError("invalid_state", { reason: "capacity_below_filled_slots" });
  }
  if (
    updates.deadline !== undefined &&
    opportunity.status !== "draft" &&
    updates.deadline <= Date.now()
  ) {
    throw apiError("invalid_state", { reason: "invalid_deadline" });
  }

  const niches =
    updates.niches === undefined
      ? await listOpportunityNiches(ctx, opportunityId)
      : await updateOpportunityNiches(ctx, opportunityId, updates.niches);
  const skills =
    updates.skills === undefined
      ? await listOpportunitySkills(ctx, opportunityId)
      : await updateOpportunitySkills(ctx, opportunityId, updates.skills);
  const languages =
    updates.languages === undefined
      ? await listOpportunityLanguages(ctx, opportunityId)
      : await updateOpportunityLanguages(ctx, opportunityId, updates.languages);
  await ctx.db.patch("opportunities", opportunityId, { ...patch, ...normalized });
  return { ...updated, ...normalized, niches, skills, languages };
}

export const opportunityList = schema
  .doc("opportunities")
  .pick("campaignId", "status")
  .partial()
  .extend({
    paginationOpts: paginationOptsValidator,
  });

export const opportunityDiscover = opportunityList
  .pick("paginationOpts")
  .extend({ niche: v.optional(v.string()) });

/**
 * Returns the creator-facing brief if creators may see the opportunity: it's
 * open, its campaign is open, and its company is active. Otherwise `null`.
 */
export async function getVisibleCreatorOpportunity(
  ctx: QueryCtx,
  opportunity: Doc<"opportunities">,
): Promise<CreatorOpportunity | null> {
  const company = await getVisibleOpportunityCompany(ctx, opportunity);
  return company === null
    ? null
    : toCreatorOpportunity(opportunity, company, await getOpportunityView(ctx, opportunity));
}

/**
 * Returns the opportunity's company if creators may see the opportunity: it's
 * open, its campaign is open, and its company is active. Otherwise `null`.
 */
export async function getVisibleOpportunityCompany(
  ctx: QueryCtx | MutationCtx,
  opportunity: Doc<"opportunities">,
): Promise<Doc<"companies"> | null> {
  if (opportunity.status !== "open") return null;
  const campaign = await ctx.db.get("campaigns", opportunity.campaignId);
  if (
    campaign === null ||
    campaign.status !== "open" ||
    campaign.companyId !== opportunity.companyId
  ) {
    return null;
  }
  const company = await ctx.db.get("companies", opportunity.companyId);
  return company !== null && company.isActive ? company : null;
}

/**
 * A discovery cursor names the section it continues: the creator's scored
 * matches, best first, then every other open brief by deadline.
 */
type DiscoverCursor = { section: "matches" | "rest"; cursor: string | null };

function parseDiscoverCursor(cursor: string | null): DiscoverCursor {
  if (cursor === null) return { section: "matches", cursor: null };
  let parsed: unknown;
  try {
    parsed = JSON.parse(cursor);
  } catch {
    throw apiError("invalid_state", { reason: "invalid_cursor" });
  }
  if (
    Array.isArray(parsed) &&
    (parsed[0] === "matches" || parsed[0] === "rest") &&
    (parsed[1] === null || typeof parsed[1] === "string")
  ) {
    return { section: parsed[0], cursor: parsed[1] };
  }
  throw apiError("invalid_state", { reason: "invalid_cursor" });
}

function formatDiscoverCursor({ section, cursor }: DiscoverCursor): string {
  return JSON.stringify([section, cursor]);
}

async function hasOpportunityScore(
  ctx: QueryCtx,
  creatorId: Id<"creators">,
  opportunityId: Id<"opportunities">,
): Promise<boolean> {
  const score = await ctx.db
    .query("opportunityScores")
    .withIndex("by_creatorId_and_opportunityId", (q) =>
      q.eq("creatorId", creatorId).eq("opportunityId", opportunityId),
    )
    .unique();
  return score !== null;
}

/**
 * Discovers open briefs across active companies. With a creator, briefs that
 * match their profile come first, best match first; the rest follow by
 * deadline. Without one, every brief is in deadline order.
 *
 * Cursors, end cursors, and split cursors all name the section they belong
 * to, and each section's stream gets the caller's full pagination options. So
 * `usePaginatedQuery` can pin each loaded page to its range: a brief whose
 * score changes moves into whichever loaded page now covers it, instead of
 * showing twice or not at all.
 */
export async function discoverOpportunities(
  ctx: QueryCtx,
  options: Infer<typeof opportunityDiscover>,
  creatorId?: Id<"creators">,
): Promise<PaginationResult<CreatorOpportunity>> {
  const niche = options.niche === undefined ? undefined : requireNiche(options.niche);
  const paginationOpts = withRowsReadCap(options.paginationOpts);
  const visible = async (opportunity: Doc<"opportunities"> | null) => {
    if (opportunity === null) return null;
    if (niche !== undefined && !(await hasOpportunityNiche(ctx, opportunity._id, niche))) {
      return null;
    }
    return await getVisibleCreatorOpportunity(ctx, opportunity);
  };
  const rest = stream(ctx.db, schema)
    .query("opportunities")
    .withIndex("by_status_and_deadline", (q) => q.eq("status", "open"))
    .map(async (opportunity) => {
      // Matches were listed already.
      if (creatorId !== undefined && (await hasOpportunityScore(ctx, creatorId, opportunity._id))) {
        return null;
      }
      return await visible(opportunity);
    });

  if (creatorId === undefined) return await rest.paginate(paginationOpts);

  const start = parseDiscoverCursor(paginationOpts.cursor);
  const end = paginationOpts.endCursor ? parseDiscoverCursor(paginationOpts.endCursor) : null;
  const inSection = (
    section: DiscoverCursor["section"],
    page: PaginationResult<CreatorOpportunity>,
  ): PaginationResult<CreatorOpportunity> => ({
    ...page,
    continueCursor: formatDiscoverCursor({ section, cursor: page.continueCursor }),
    splitCursor: page.splitCursor && formatDiscoverCursor({ section, cursor: page.splitCursor }),
  });
  // A rest section that starts at its beginning ends this page right after the matches.
  const endsAtMatches = end?.section === "rest" && end.cursor === null;

  let matches: CreatorOpportunity[] = [];
  if (start.section === "matches") {
    // Filter inside the stream so hidden or off-niche matches don't leave pages short.
    const page = await stream(ctx.db, schema)
      .query("opportunityScores")
      .withIndex("by_creatorId_and_score", (q) => q.eq("creatorId", creatorId))
      .order("desc")
      .map(async (score) => await visible(await ctx.db.get("opportunities", score.opportunityId)))
      .paginate({
        ...paginationOpts,
        cursor: start.cursor,
        endCursor: end?.section === "matches" ? end.cursor : undefined,
      });
    if (end?.section === "matches" || !page.isDone) {
      return inSection("matches", { ...page, isDone: false });
    }
    // The matches ran out; the rest list starts after them, on this page if there's room.
    const room = paginationOpts.numItems - page.page.length;
    if (endsAtMatches || (end === null && room <= 0)) {
      return {
        page: page.page,
        isDone: false,
        continueCursor: formatDiscoverCursor({ section: "rest", cursor: null }),
      };
    }
    matches = page.page;
  }

  const restPage = await rest.paginate({
    ...paginationOpts,
    numItems: Math.max(paginationOpts.numItems - matches.length, 1),
    cursor: start.section === "rest" ? start.cursor : null,
    endCursor: end?.section === "rest" ? end.cursor : undefined,
  });
  return inSection("rest", { ...restPage, page: [...matches, ...restPage.page] });
}

/** Lists the company's opportunities, optionally scoped to an owned campaign and status. */
export async function listOpportunities(
  ctx: QueryCtx,
  companyId: Id<"companies">,
  options: Infer<typeof opportunityList>,
): Promise<PaginationResult<OpportunityView>> {
  const { campaignId, status } = options;
  if (campaignId !== undefined) {
    const campaign = await ctx.db.get("campaigns", campaignId);
    if (campaign === null || campaign.companyId !== companyId) {
      throw apiError("not_found", { resource: "campaign" });
    }
    const result = await ctx.db
      .query("opportunities")
      .withIndex("by_campaignId_and_status", (q) => {
        const range = q.eq("campaignId", campaignId);
        return status === undefined ? range : range.eq("status", status);
      })
      .paginate(options.paginationOpts);
    return {
      ...result,
      page: await Promise.all(
        result.page.map((opportunity) => getOpportunityView(ctx, opportunity)),
      ),
    };
  }
  const result = await ctx.db
    .query("opportunities")
    .withIndex("by_companyId_and_status", (q) => {
      const range = q.eq("companyId", companyId);
      return status === undefined ? range : range.eq("status", status);
    })
    .paginate(options.paginationOpts);
  return {
    ...result,
    page: await Promise.all(result.page.map((opportunity) => getOpportunityView(ctx, opportunity))),
  };
}

/** Creates a draft or open opportunity in the caller's campaign; ownership is server-derived. */
export async function createOpportunity(
  ctx: MutationCtx,
  membership: Doc<"companyUsers">,
  fields: OpportunityCreate,
): Promise<Id<"opportunities">> {
  const campaign = await ctx.db.get("campaigns", fields.campaignId);
  if (campaign === null || campaign.companyId !== membership.companyId) {
    throw apiError("not_found", { resource: "campaign" });
  }
  if (campaign.status === "closed" || (fields.status === "open" && campaign.status !== "open")) {
    throw apiError("invalid_state", { reason: "campaign_not_open" });
  }
  const { title, description } = validateOpportunityFields(fields);
  const { deliverables = [], ...brief } = fields;
  requireAiReviewCriteria(fields.usesAiReviewDefault, deliverables);
  if (fields.status === "open" && deliverables.length === 0) {
    throw apiError("invalid_state", { reason: "deliverables_required" });
  }
  if (campaign.endsAt !== undefined && fields.deadline > campaign.endsAt) {
    throw apiError("invalid_state", { reason: "deadline_after_campaign_end" });
  }
  const { niches, skills, languages, ...storedFields } = brief;
  const productAccess =
    fields.productAccessLink === undefined
      ? {}
      : {
          productAccessLink: requireUrl(fields.productAccessLink, {
            reason: "invalid_product_access_link",
          }),
        };
  const opportunityId = await ctx.db.insert("opportunities", {
    ...storedFields,
    ...productAccess,
    title,
    description,
    companyId: campaign.companyId,
    createdBy: membership._id,
    numFilledSlots: 0,
  });
  await insertDeliverables(ctx, opportunityId, membership._id, deliverables, 0);
  if (niches !== undefined) await updateOpportunityNiches(ctx, opportunityId, niches);
  if (skills !== undefined) await updateOpportunitySkills(ctx, opportunityId, skills);
  if (languages !== undefined) await updateOpportunityLanguages(ctx, opportunityId, languages);
  return opportunityId;
}

/** Validates shared write bounds and returns the normalized brief text. */
function validateOpportunityFields(
  fields: Omit<OpportunityCreate, "status"> & Pick<Doc<"opportunities">, "status">,
): {
  title: string;
  description: string;
} {
  const title = requireNonBlank(fields.title, "title");
  const description = requireNonBlank(fields.description, "description");
  for (const field of ["fixedFeeCents", "cpmRateCents", "paymentCapCents"] as const) {
    if (!Number.isSafeInteger(fields[field]) || fields[field] < 0) {
      throw apiError("invalid_state", { reason: "invalid_compensation", field });
    }
  }
  if (!Number.isSafeInteger(fields.maxSlots) || fields.maxSlots <= 0) {
    throw apiError("invalid_state", { reason: "invalid_capacity", field: "maxSlots" });
  }
  validateOpportunityDeadline(fields.deadline);
  if (fields.status === "open" && fields.deadline <= Date.now()) {
    throw apiError("invalid_state", { reason: "invalid_deadline" });
  }
  return { title, description };
}

/** Returns an opportunity visible to its company, a creator, or an operator. */
export async function requireOpportunity(
  ctx: QueryCtx | MutationCtx,
  opportunityId: Id<"opportunities">,
  caller: { user: Doc<"users">; orgId: string | null },
): Promise<Doc<"opportunities">> {
  const opportunity = await ctx.db.get("opportunities", opportunityId);
  if (opportunity === null) {
    throw apiError("not_found", { resource: "opportunity" });
  }
  if (caller.user.role === "operator") return opportunity;

  const campaign = await ctx.db.get("campaigns", opportunity.campaignId);
  if (campaign === null || campaign.companyId !== opportunity.companyId) {
    throw apiError("not_found", { resource: "opportunity" });
  }
  if (caller.user.role === "company") {
    if (caller.orgId === null) {
      throw apiError("misconfigured", { reason: "company account has no organization" });
    }
    const membership = await requireMembership(ctx, caller.user._id, caller.orgId);
    if (membership.companyId !== opportunity.companyId) {
      throw apiError("not_found", { resource: "opportunity" });
    }
    return opportunity;
  }

  const company = await ctx.db.get("companies", opportunity.companyId);
  if (
    opportunity.status !== "open" ||
    campaign.status !== "open" ||
    company === null ||
    !company.isActive
  ) {
    throw apiError("not_found", { resource: "opportunity" });
  }
  return opportunity;
}
