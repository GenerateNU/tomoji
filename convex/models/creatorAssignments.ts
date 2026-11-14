import { mergedStream, stream } from "convex-helpers/server/stream";
import { v, type Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import schema from "../schema";
import { submissionStatus } from "../schemas/submissions.schema";
import {
  creatorAssignment,
  creatorAssignmentListFilters,
  toCreatorAssignment,
} from "./assignments";
import { listOpportunityDeliverables } from "./deliverableDrafts";
import { getLatestSubmission } from "./submissions";

export const assignmentQueue = v.union(v.literal("todo"), v.literal("review"), v.literal("posted"));

export const creatorAssignmentSummaryFilters = creatorAssignmentListFilters.extend({
  queue: v.optional(assignmentQueue),
  search: v.optional(v.string()),
  companyId: v.optional(v.id("companies")),
  opportunityId: v.optional(v.id("opportunities")),
  order: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
});

export const creatorAssignmentSummary = creatorAssignment
  .pick("_id", "_creationTime", "status", "companyId", "opportunityId")
  .extend({
    title: v.union(v.string(), v.null()),
    companyName: v.union(v.string(), v.null()),
    companyPictureId: v.optional(v.id("mediaUploads")),
    queue: assignmentQueue,
    next: v.union(
      v.object({
        id: v.id("deliverables"),
        status: v.union(submissionStatus, v.literal("unsubmitted")),
      }),
      v.null(),
    ),
  });

export const creatorAssignmentFilterOptions = v.object({
  companies: v.array(v.object({ id: v.id("companies"), label: v.string() })),
  opportunities: v.array(v.object({ id: v.id("opportunities"), label: v.string() })),
});

export const creatorAssignmentDetails = v.object({
  assignment: creatorAssignment,
  title: creatorAssignmentSummary.fields.title,
  companyName: creatorAssignmentSummary.fields.companyName,
  brief: v.union(
    schema.doc("opportunities").pick("description", "contentRequirements", "reviewPolicy"),
    v.null(),
  ),
  deliverables: v.array(
    schema
      .doc("deliverables")
      .pick("_id", "title", "description")
      .extend({
        latest: v.union(v.object({ _id: v.id("submissions"), status: submissionStatus }), v.null()),
      }),
  ),
});

/** Resolves the next actionable deliverable and the assignment's overall queue. */
async function getAssignmentProgress(ctx: QueryCtx, assignment: Doc<"assignments">) {
  const deliverables = await listOpportunityDeliverables(ctx, assignment.opportunityId);
  const progress = await Promise.all(
    deliverables.map(async ({ _id }) => {
      const latest = await getLatestSubmission(ctx, assignment._id, _id);
      const post =
        latest?.status === "approved"
          ? await ctx.db
              .query("posts")
              .withIndex("by_submissionId_and_isActive", (q) =>
                q.eq("submissionId", latest._id).eq("isActive", true),
              )
              .first()
          : null;
      return { id: _id, status: latest?.status ?? "unsubmitted", posted: post !== null } as const;
    }),
  );
  const next =
    progress.find((row) => row.status === "changesRequested") ??
    progress.find((row) => row.status === "unsubmitted") ??
    progress.find((row) => row.status === "approved" && !row.posted);
  let queue: Infer<typeof assignmentQueue> = "todo";
  if (!next && progress.some((row) => row.status === "pending")) queue = "review";
  if (progress.length > 0 && progress.every((row) => row.posted)) queue = "posted";
  return { queue, next: next ? { id: next.id, status: next.status } : null };
}

const maxSummaryRowsRead = 60;
const maxFilterAssignments = 120;

/** Filters before pagination so queue and search results include all matching assignments. */
export async function listCreatorAssignmentSummaries(
  ctx: QueryCtx,
  creatorId: Id<"creators">,
  options: Infer<typeof creatorAssignmentSummaryFilters>,
) {
  const search = options.search?.trim().toLowerCase();
  const statuses =
    options.queue === "posted"
      ? (["active", "completed"] as const)
      : options.phase === "current"
        ? (["termsPending", "active"] as const)
        : (["completed", "cancelled"] as const);
  return await creatorAssignmentsByTime(ctx, creatorId, statuses, options.order ?? "desc")
    .map(async (assignment) => {
      if (options.companyId && assignment.companyId !== options.companyId) return null;
      if (options.opportunityId && assignment.opportunityId !== options.opportunityId) return null;
      const [opportunity, company] = await Promise.all([
        ctx.db.get("opportunities", assignment.opportunityId),
        ctx.db.get("companies", assignment.companyId),
      ]);
      if (
        search &&
        ![opportunity?.title, company?.name].some((label) => label?.toLowerCase().includes(search))
      ) {
        return null;
      }
      const progress = await getAssignmentProgress(ctx, assignment);
      if (options.queue && progress.queue !== options.queue) return null;
      return {
        _id: assignment._id,
        _creationTime: assignment._creationTime,
        status: assignment.status,
        companyId: assignment.companyId,
        opportunityId: assignment.opportunityId,
        title: opportunity?.title ?? null,
        companyName: company?.name ?? null,
        companyPictureId: company?.profilePictureMediaId,
        ...progress,
      };
    })
    // A summary can read up to 20 deliverables, each with a submission and post.
    .paginate({
      ...options.paginationOpts,
      maximumRowsRead: Math.min(
        options.paginationOpts.maximumRowsRead ?? maxSummaryRowsRead,
        maxSummaryRowsRead,
      ),
    });
}

/** Combines status-indexed ranges in assignment creation order. */
function creatorAssignmentsByTime(
  ctx: QueryCtx,
  creatorId: Id<"creators">,
  statuses: readonly Doc<"assignments">["status"][],
  order: "asc" | "desc",
) {
  const streams = statuses.map((status) =>
    stream(ctx.db, schema)
      .query("assignments")
      .withIndex("by_creatorId_and_status", (q) =>
        q.eq("creatorId", creatorId).eq("status", status),
      )
      .order(order),
  );
  return mergedStream(streams, ["_creationTime"]);
}

/** Offers filters from the caller's most recent assignments across all stages. */
export async function listCreatorAssignmentFilterOptions(ctx: QueryCtx, creatorId: Id<"creators">) {
  const assignments = await creatorAssignmentsByTime(
    ctx,
    creatorId,
    ["termsPending", "active", "completed", "cancelled"],
    "desc",
  ).take(maxFilterAssignments);
  const [companies, opportunities] = await Promise.all([
    Promise.all(
      [...new Set(assignments.map((row) => row.companyId))].map((id) =>
        ctx.db.get("companies", id),
      ),
    ),
    Promise.all(
      [...new Set(assignments.map((row) => row.opportunityId))].map((id) =>
        ctx.db.get("opportunities", id),
      ),
    ),
  ]);
  return {
    companies: companies.flatMap((row) => (row ? [{ id: row._id, label: row.name }] : [])),
    opportunities: opportunities.flatMap((row) => (row ? [{ id: row._id, label: row.title }] : [])),
  };
}

/** Loads the brief and each deliverable's latest submission for an owned assignment. */
export async function getCreatorAssignmentDetails(
  ctx: QueryCtx,
  creatorId: Id<"creators">,
  id: string,
): Promise<Infer<typeof creatorAssignmentDetails> | null> {
  const assignmentId = ctx.db.normalizeId("assignments", id);
  if (assignmentId === null) return null;
  const assignment = await ctx.db.get("assignments", assignmentId);
  if (assignment === null || assignment.creatorId !== creatorId) return null;
  const [opportunity, company, deliverables] = await Promise.all([
    ctx.db.get("opportunities", assignment.opportunityId),
    ctx.db.get("companies", assignment.companyId),
    listOpportunityDeliverables(ctx, assignment.opportunityId),
  ]);
  return {
    assignment: toCreatorAssignment(assignment),
    title: opportunity?.title ?? null,
    companyName: company?.name ?? null,
    brief: opportunity && {
      description: opportunity.description,
      contentRequirements: opportunity.contentRequirements,
      reviewPolicy: opportunity.reviewPolicy,
    },
    deliverables: await Promise.all(
      deliverables.map(async ({ _id, title, description }) => {
        const latest = await getLatestSubmission(ctx, assignmentId, _id);
        return {
          _id,
          title,
          description,
          latest: latest && { _id: latest._id, status: latest.status },
        };
      }),
    ),
  };
}
