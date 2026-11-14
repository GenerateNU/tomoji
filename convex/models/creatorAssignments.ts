import { v, type Infer } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import schema from "../schema";
import { submissionStatus } from "../schemas/submissions.schema";
import {
  creatorAssignment,
  creatorAssignmentListFilters,
  listCreatorAssignments,
  toCreatorAssignment,
} from "./assignments";
import { listOpportunityDeliverables } from "./deliverableDrafts";
import { getLatestSubmission } from "./submissions";

export const creatorAssignmentSummary = creatorAssignment.pick("_id", "status").extend({
  title: v.union(v.string(), v.null()),
  companyName: v.union(v.string(), v.null()),
});

export const creatorAssignmentDetails = v.object({
  assignment: creatorAssignment,
  title: creatorAssignmentSummary.fields.title,
  companyName: creatorAssignmentSummary.fields.companyName,
  brief: v.union(
    schema
      .doc("opportunities")
      .pick(
        "description",
        "contentRequirements",
        "prohibitedClaims",
        "disclosureRequirements",
        "usageRights",
      ),
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

/** Hydrates the creator's assignment page with display names, including closed opportunities. */
export async function listCreatorAssignmentSummaries(
  ctx: QueryCtx,
  creatorId: Id<"creators">,
  options: Infer<typeof creatorAssignmentListFilters>,
) {
  const result = await listCreatorAssignments(ctx, creatorId, options);
  const page = await Promise.all(
    result.page.map(async (assignment) => {
      const [opportunity, company] = await Promise.all([
        ctx.db.get("opportunities", assignment.opportunityId),
        ctx.db.get("companies", assignment.companyId),
      ]);
      return {
        _id: assignment._id,
        status: assignment.status,
        title: opportunity?.title ?? null,
        companyName: company?.name ?? null,
      };
    }),
  );
  return { ...result, page };
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
      prohibitedClaims: opportunity.prohibitedClaims,
      disclosureRequirements: opportunity.disclosureRequirements,
      usageRights: opportunity.usageRights,
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
