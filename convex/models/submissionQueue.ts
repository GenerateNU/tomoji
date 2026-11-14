import { v, type Infer } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { submissionStatus } from "../schemas/submissions.schema";
import { listOpportunityDeliverables } from "./deliverableDrafts";

const assignmentLimit = 80;
const draftLimit = 250;
const roundLimit = 30;

const queueRow = v.object({
  submissionId: v.id("submissions"),
  assignmentId: v.id("assignments"),
  deliverableId: v.id("deliverables"),
  title: v.string(),
  creatorName: v.string(),
  campaignId: v.id("campaigns"),
  campaignTitle: v.string(),
  round: v.number(),
  roundIsCapped: v.boolean(),
  submittedAt: v.number(),
  status: submissionStatus,
});

export const submissionQueue = v.object({ rows: v.array(queueRow), isCapped: v.boolean() });

/** Reads the latest draft per deliverable within a bounded window of company assignments. */
export async function listSubmissionQueue(
  ctx: QueryCtx,
  companyId: Id<"companies">,
): Promise<Infer<typeof submissionQueue>> {
  const assignments = await ctx.db
    .query("assignments")
    .withIndex("by_companyId", (q) => q.eq("companyId", companyId))
    .order("desc")
    .take(assignmentLimit + 1);
  const rows: Infer<typeof queueRow>[] = [];
  let remaining = draftLimit;

  // Stop before joining any further assignments once the draft read budget is spent.
  for (const assignment of assignments.slice(0, assignmentLimit)) {
    const [campaign, creator, deliverables] = await Promise.all([
      ctx.db.get("campaigns", assignment.campaignId),
      ctx.db.get("creators", assignment.creatorId),
      listOpportunityDeliverables(ctx, assignment.opportunityId),
    ]);
    if (campaign?.companyId !== companyId || creator === null) continue;
    const user = await ctx.db.get("users", creator.userId);
    const creatorName = user
      ? [user.firstName, user.lastName].filter(Boolean).join(" ")
      : "Creator";

    for (const deliverable of deliverables) {
      const drafts = await ctx.db
        .query("submissions")
        .withIndex("by_assignmentId_and_deliverableId", (q) =>
          q.eq("assignmentId", assignment._id).eq("deliverableId", deliverable._id),
        )
        .order("desc")
        .take(Math.min(roundLimit + 1, remaining));
      const [latest] = drafts;
      if (latest === undefined) continue;
      const roundIsCapped = drafts.length > roundLimit || drafts.length === remaining;
      remaining -= drafts.length;

      // Closed pending drafts cannot be reviewed. Keep reviewed rounds visible.
      if (latest.status !== "pending" || assignment.status === "active") {
        rows.push({
          submissionId: latest._id,
          assignmentId: assignment._id,
          deliverableId: deliverable._id,
          title: deliverable.title,
          creatorName,
          campaignId: campaign._id,
          campaignTitle: campaign.title,
          round: Math.min(drafts.length, roundLimit),
          roundIsCapped,
          submittedAt: latest._creationTime,
          status: latest.status,
        });
      }
      if (remaining === 0) return { rows, isCapped: true };
    }
  }

  return { rows, isCapped: assignments.length > assignmentLimit };
}
