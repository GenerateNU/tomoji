import type { PaginationOptions, PaginationResult } from "convex/server";
import type { Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { apiError } from "../lib/errors";
import type { applicationStatus } from "../schemas/applications.schema";

/**
 * Creates a pending application from a creator to an open, gated opportunity.
 *
 * @throws `not_found` if the opportunity does not exist.
 * The note is optional; a missing or blank note is stored as "".
 *
 * @throws `invalid_state` if the opportunity or its campaign is not open, the
 * opportunity is ungated, or it already has `maxApplications` applications.
 * @throws `conflict` if the creator has already applied.
 */
export async function createApplication(
  ctx: MutationCtx,
  creatorId: Id<"creators">,
  args: { opportunityId: Id<"opportunities">; note?: string },
): Promise<Id<"applications">> {
  const note = args.note?.trim() ?? "";
  const opportunity = await ctx.db.get("opportunities", args.opportunityId);
  if (opportunity === null) {
    throw apiError("not_found", { resource: "opportunity" });
  }
  if (opportunity.status !== "open") {
    throw apiError("invalid_state", { reason: "opportunity_not_open" });
  }
  // Ungated opportunities are joined directly, without an application.
  if (!opportunity.isGated) {
    throw apiError("invalid_state", { reason: "opportunity_not_gated" });
  }
  // Pausing a campaign pauses its opportunities, so check the campaign too.
  const campaign = await ctx.db.get("campaigns", opportunity.campaignId);
  if (campaign === null || campaign.status !== "open") {
    throw apiError("invalid_state", { reason: "campaign_not_open" });
  }

  // One application per creator per opportunity: blocks double-submits and
  // retries, which the non-unique index cannot prevent on its own.
  const existing = await ctx.db
    .query("applications")
    .withIndex("by_opportunityId_and_creatorId", (q) =>
      q.eq("opportunityId", opportunity._id).eq("creatorId", creatorId),
    )
    .first();
  if (existing !== null) {
    throw apiError("conflict", { reason: "already_applied" });
  }

  // Every application counts toward the cap, whatever its status. Reads at most
  // maxApplications rows; concurrent applies read the same range, so Convex
  // retries one and the cap cannot be exceeded.
  const received = await ctx.db
    .query("applications")
    .withIndex("by_opportunityId_and_status", (q) => q.eq("opportunityId", opportunity._id))
    .take(opportunity.maxApplications);
  if (received.length >= opportunity.maxApplications) {
    throw apiError("invalid_state", { reason: "applications_full" });
  }

  return await ctx.db.insert("applications", {
    opportunityId: opportunity._id,
    creatorId,
    note,
    status: "pending",
  });
}

/** Who is reading an application, resolved from the caller by the route. */
export type ApplicationViewer =
  | { role: "operator" }
  | { role: "creator"; creatorId: Id<"creators"> }
  | { role: "company"; companyId: Id<"companies"> };

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
  if (application === null || !(await canViewApplication(ctx, viewer, application))) {
    throw apiError("not_found", { resource: "application" });
  }
  return application;
}

async function canViewApplication(
  ctx: QueryCtx | MutationCtx,
  viewer: ApplicationViewer,
  application: Doc<"applications">,
): Promise<boolean> {
  switch (viewer.role) {
    case "operator":
      return true;
    case "creator":
      return application.creatorId === viewer.creatorId;
    case "company": {
      // Applications do not store companyId, pulls from opportunity -> campaign.
      const opportunity = await ctx.db.get("opportunities", application.opportunityId);
      if (opportunity === null) return false;
      const campaign = await ctx.db.get("campaigns", opportunity.campaignId);
      return campaign?.companyId === viewer.companyId;
    }
  }
}

/**
 * Returns one page of a creator's applications, optionally filtered by status.
 * Results are ordered by status, then newest first within each status.
 */
export async function listApplications(
  ctx: QueryCtx,
  options: {
    creatorId: Id<"creators">;
    status?: Infer<typeof applicationStatus>;
    paginationOpts: PaginationOptions;
  },
): Promise<PaginationResult<Doc<"applications">>> {
  const { creatorId, status } = options;
  return await ctx.db
    .query("applications")
    .withIndex("by_creatorId_and_status", (q) =>
      status === undefined
        ? q.eq("creatorId", creatorId)
        : q.eq("creatorId", creatorId).eq("status", status),
    )
    .order("desc")
    .paginate(options.paginationOpts);
}
