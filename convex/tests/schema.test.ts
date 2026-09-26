/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import type { WithoutSystemFields } from "convex/server";
import { describe, expect, test } from "vitest";
import type { Doc, Id } from "../_generated/dataModel";
import { getCompanyByWorkosId } from "../models/companies";
import { getCompanyUser } from "../models/companyUsers";
import { getUserByWorkosId } from "../models/users";
import schema from "../schema";
import { seedCreatorId, seedUser, type TestConvex } from "./helpers";

const modules = import.meta.glob("../**/*.ts");
const NOW = 1_800_000_000_000;

async function seedWorkflow(t: TestConvex) {
  await seedUser(t, { subject: "brand", org: { id: "org_brand" } });
  const creatorId = await seedCreatorId(t, "creator");

  return await t.run(async (ctx) => {
    const user = await getUserByWorkosId(ctx, "brand");
    const company = await getCompanyByWorkosId(ctx, "org_brand");
    const membership = await getCompanyUser(ctx, user!._id, company!._id);
    const campaignId = await ctx.db.insert("campaigns", {
      companyId: company!._id,
      createdBy: membership!._id,
      title: "Developer launch",
      objective: "Introduce the new API",
      product: "Tomoji SDK",
      audience: "Independent developers",
      description: "Creators demonstrate a working integration.",
      budgetCents: 100_000,
      startsAt: NOW,
    });
    const opportunityId = await ctx.db.insert("opportunities", {
      campaignId,
      createdBy: membership!._id,
      title: "Build with the SDK",
      description: "Publish a short walkthrough.",
      isGated: true,
      usesAiReviewDefault: false,
      targetApplicant: "Developer educators",
      maxSlots: 3,
      numFilledSlots: 1,
      maxApplications: 20,
      deadline: NOW + 86_400_000,
      status: "open",
      fixedFeeCents: 20_000,
      cpmRateCents: 500,
      paymentCapCents: 30_000,
      contentRequirements: "Show a working example.",
      prohibitedClaims: "Guaranteed revenue",
      disclosureRequirements: "#ad",
      usageRights: "Organic reposting for 30 days",
    });
    const assignmentId = await ctx.db.insert("assignments", {
      opportunityId,
      creatorId,
      fixedFeeCents: 20_000,
      cpmRateCents: 500,
      paymentCapCents: 30_000,
      usesAiReview: false,
      status: "active",
    });
    return { campaignId, opportunityId, assignmentId, creatorId, membershipId: membership!._id };
  });
}

describe("campaign delivery schema", () => {
  test("stores opportunity claims and disclosure requirements as text", async () => {
    const t = convexTest(schema, modules);
    const { opportunityId } = await seedWorkflow(t);
    const opportunity = await t.run(
      async (ctx) => await ctx.db.get("opportunities", opportunityId),
    );

    expect(opportunity).toMatchObject({
      prohibitedClaims: "Guaranteed revenue",
      disclosureRequirements: "#ad",
    });
  });

  test.each(["prohibitedClaims", "disclosureRequirements"] as const)(
    "rejects legacy arrays for opportunity %s",
    async (field) => {
      const t = convexTest(schema, modules);
      const { opportunityId } = await seedWorkflow(t);

      await expect(
        t.run(async (ctx) => {
          await ctx.db.patch("opportunities", opportunityId, {
            [field]: ["Legacy array"] as never, // Exercise the persisted validator.
          });
        }),
      ).rejects.toThrow(/Validator error: Expected `string`/);
    },
  );

  test("stores and retrieves an application, reviewed draft, post, and dispute by their parent links", async () => {
    const t = convexTest(schema, modules);
    const workflow = await seedWorkflow(t);

    const stored = await t.run(async (ctx) => {
      const applicationId = await ctx.db.insert("applications", {
        opportunityId: workflow.opportunityId,
        creatorId: workflow.creatorId,
        note: "I can demonstrate this in a live coding video.",
        status: "accepted",
        offerAcceptedAt: NOW,
      });
      const submissionId = await ctx.db.insert("submissions", {
        assignmentId: workflow.assignmentId,
        draftUrl: "https://example.com/drafts/sdk-walkthrough",
        draftDescription: "A two-minute SDK walkthrough.",
        status: "approved",
        reviewerType: "companyUser",
        reviewedBy: workflow.membershipId,
        reviewedAt: NOW,
      });
      const postId = await ctx.db.insert("posts", {
        submissionId,
        url: "https://example.com/posts/sdk-walkthrough",
        postedAt: NOW,
        isVerified: true,
        likes: 25,
        comments: 5,
        reposts: 3,
        views: 1_500,
        lastUpdatedAt: NOW + 3_600_000,
      });
      const creator = await ctx.db.get("creators", workflow.creatorId);
      const disputeId = await ctx.db.insert("disputes", {
        assignmentId: workflow.assignmentId,
        openedBy: creator!.userId,
        reason: "View count mismatch",
        description: "The platform reports a different view count.",
        status: "open",
      });

      return {
        applicationId,
        postId,
        disputeId,
        application: await ctx.db
          .query("applications")
          .withIndex("by_opportunityId_and_creatorId", (q) =>
            q.eq("opportunityId", workflow.opportunityId).eq("creatorId", workflow.creatorId),
          )
          .unique(),
        submission: await ctx.db
          .query("submissions")
          .withIndex("by_assignmentId", (q) => q.eq("assignmentId", workflow.assignmentId))
          .unique(),
        post: await ctx.db
          .query("posts")
          .withIndex("by_submissionId", (q) => q.eq("submissionId", submissionId))
          .unique(),
        dispute: await ctx.db
          .query("disputes")
          .withIndex("by_assignmentId_and_status", (q) =>
            q.eq("assignmentId", workflow.assignmentId).eq("status", "open"),
          )
          .unique(),
      };
    });

    expect(stored.application?._id).toBe(stored.applicationId);
    expect(stored.application?.status).toBe("accepted");
    expect(stored.application?.offerAcceptedAt).toBe(NOW);
    expect(stored.submission).toMatchObject({
      reviewerType: "companyUser",
      reviewedBy: workflow.membershipId,
    });
    expect(stored.post).toMatchObject({ _id: stored.postId, views: 1_500 });
    expect(stored.dispute?._id).toBe(stored.disputeId);
  });

  test("rejects arbitrary application statuses at the database boundary", async () => {
    const t = convexTest(schema, modules);
    const workflow = await seedWorkflow(t);

    await expect(
      t.run(
        async (ctx) =>
          await ctx.db.insert("applications", {
            opportunityId: workflow.opportunityId,
            creatorId: workflow.creatorId,
            note: "Application",
            status: "unknown" as never, // Exercise runtime validation despite static types.
          }),
      ),
    ).rejects.toThrow(/Validator error/);
  });

  test("requires a creator profile ID instead of a user ID for an application", async () => {
    const t = convexTest(schema, modules);
    const workflow = await seedWorkflow(t);

    await expect(
      t.run(async (ctx) => {
        const creator = await ctx.db.get("creators", workflow.creatorId);
        return await ctx.db.insert("applications", {
          opportunityId: workflow.opportunityId,
          creatorId: creator!.userId as unknown as Id<"creators">,
          note: "Application",
          status: "pending",
        });
      }),
    ).rejects.toThrow(/Validator error/);
  });

  test("supports an unreviewed draft followed by an AI review without a human reviewer ID", async () => {
    const t = convexTest(schema, modules);
    const workflow = await seedWorkflow(t);
    const submission = await t.run(async (ctx) => {
      const id = await ctx.db.insert("submissions", {
        assignmentId: workflow.assignmentId,
        draftUrl: "https://example.com/draft",
        draftDescription: "Walkthrough",
        status: "pending",
      });
      await ctx.db.patch("submissions", id, {
        status: "changesRequested",
        reviewerType: "ai",
        reviewedAt: NOW,
        reviewNote: "Include the disclosure.",
      });
      return await ctx.db.get("submissions", id);
    });

    expect(submission).toMatchObject({ reviewerType: "ai", status: "changesRequested" });
    expect(submission).not.toHaveProperty("reviewedBy");
  });

  test.each(["approved", "changesRequested"] as const)(
    "requires review attribution for a %s submission",
    async (status) => {
      const t = convexTest(schema, modules);
      const workflow = await seedWorkflow(t);
      const submission = {
        assignmentId: workflow.assignmentId,
        draftUrl: "https://example.com/draft",
        draftDescription: "Walkthrough",
        status,
      } as WithoutSystemFields<Doc<"submissions">>;

      await expect(
        t.run(async (ctx) => await ctx.db.insert("submissions", submission)),
      ).rejects.toThrow(/Validator error/);
    },
  );

  test.each([
    {
      name: "human review without a reviewer",
      review: () => ({ reviewerType: "companyUser", reviewedAt: NOW }),
    },
    {
      name: "AI review with a human reviewer",
      review: (id: Id<"companyUsers">) => ({ reviewerType: "ai", reviewedBy: id, reviewedAt: NOW }),
    },
    {
      name: "reviewer without a review type",
      review: (id: Id<"companyUsers">) => ({ reviewedBy: id, reviewedAt: NOW }),
    },
    {
      name: "review without a timestamp",
      review: (id: Id<"companyUsers">) => ({ reviewerType: "companyUser", reviewedBy: id }),
    },
  ])("rejects $name", async ({ review }) => {
    const t = convexTest(schema, modules);
    const workflow = await seedWorkflow(t);
    // Deliberately bypass the static type to verify persisted review consistency.
    const submission = {
      assignmentId: workflow.assignmentId,
      draftUrl: "https://example.com/draft",
      draftDescription: "Walkthrough",
      status: "approved",
      ...review(workflow.membershipId),
    } as WithoutSystemFields<Doc<"submissions">>;

    await expect(
      t.run(async (ctx) => await ctx.db.insert("submissions", submission)),
    ).rejects.toThrow(/Validator error/);
  });
});
