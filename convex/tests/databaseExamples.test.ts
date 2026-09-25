/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import type { FunctionArgs, WithoutSystemFields } from "convex/server";
import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import schema from "../schema";
import { expectApiError, seedUser, workosIdentity } from "./helpers";

const modules = import.meta.glob("../**/*.ts");
const NOW = Date.UTC(2026, 8, 25, 12);
const DAY = 86_400_000;
const PAGE = { cursor: null, numItems: 10 };

function campaignArgs(title: string): FunctionArgs<typeof api.campaigns.create> {
  return {
    title,
    objective: "Show developers a working integration",
    product: "Developer SDK",
    audience: "Independent developers",
    description: "Creators publish an integration walkthrough.",
    budgetCents: 100_000,
    startsAt: NOW,
  };
}

async function seedExamples() {
  const t = convexTest(schema, modules);
  // These helpers call the actual user/membership models used by WorkOS sync.
  const acme = await seedUser(t, {
    subject: "acme_owner",
    org: { id: "org_acme", name: "Acme", role: "admin" },
  });
  const other = await seedUser(t, {
    subject: "other_owner",
    org: { id: "org_other", name: "Other", role: "admin" },
  });
  const ada = await seedUser(t, { subject: "ada" });
  const ben = await seedUser(t, { subject: "ben" });
  const adaProfile = await ada.query(api.creators.me, {});
  const benProfile = await ben.query(api.creators.me, {});
  const acmeCampaignId = await acme.mutation(api.campaigns.create, campaignArgs("Acme launch"));
  const otherCampaignId = await other.mutation(api.campaigns.create, campaignArgs("Other launch"));

  const records = await t.run(async (ctx) => {
    const acmeCampaign = (await ctx.db.get("campaigns", acmeCampaignId))!;
    const otherCampaign = (await ctx.db.get("campaigns", otherCampaignId))!;
    // Workflow creation APIs do not exist yet. Direct inserts below exercise
    // persisted shapes and indexes, not authorization or lifecycle transitions.
    const opportunity = (
      campaign: Doc<"campaigns">,
      status: Doc<"opportunities">["status"],
      deadline: number,
    ): WithoutSystemFields<Doc<"opportunities">> => ({
      campaignId: campaign._id,
      createdBy: campaign.createdBy,
      title: `${campaign.title}: ${status}`,
      description: "Publish a short SDK walkthrough.",
      isGated: true,
      usesAiReviewDefault: false,
      targetApplicant: "Developer educators",
      maxSlots: 2,
      numFilledSlots: 0,
      maxApplications: 20,
      deadline,
      status,
      fixedFeeCents: 20_000,
      cpmRateCents: 500,
      paymentCapCents: 30_000,
      contentRequirements: "Show a working example.",
      prohibitedClaims: ["Guaranteed revenue"],
      disclosureRequirements: ["#ad"],
      usageRights: "Organic reposting for 30 days",
    });
    const acmeOpen = await ctx.db.insert("opportunities", opportunity(acmeCampaign, "open", NOW));
    const acmePaused = await ctx.db.insert(
      "opportunities",
      opportunity(acmeCampaign, "paused", NOW),
    );
    const otherOpen = await ctx.db.insert(
      "opportunities",
      opportunity(otherCampaign, "open", NOW + DAY),
    );
    const otherClosed = await ctx.db.insert(
      "opportunities",
      opportunity(otherCampaign, "closed", NOW),
    );
    return { acmeCampaign, otherCampaign, acmeOpen, acmePaused, otherOpen, otherClosed };
  });

  return {
    t,
    acme,
    other,
    ada,
    adaId: adaProfile.creatorId,
    benId: benProfile.creatorId,
    ...records,
  };
}

describe("local database query examples", () => {
  test("existing APIs isolate company memberships and refuse unauthorized campaign creation", async () => {
    const fixture = await seedExamples();
    const { t, acme, other, ada, acmeCampaign, otherCampaign } = fixture;
    const acmeMembers = await acme.query(api.companyUsers.list, { paginationOpts: PAGE });
    const otherMembers = await other.query(api.companyUsers.list, { paginationOpts: PAGE });

    expect(acmeMembers.page.map((member) => member.email)).toEqual(["acme_owner@example.com"]);
    expect(otherMembers.page.map((member) => member.email)).toEqual(["other_owner@example.com"]);
    expect(acmeCampaign.createdBy).toBe(acmeMembers.page[0]!.membershipId);
    expect(otherCampaign.createdBy).toBe(otherMembers.page[0]!.membershipId);
    expect(acmeCampaign.companyId).not.toBe(otherCampaign.companyId);

    const foreignOrg = t.withIdentity(
      workosIdentity({ subject: "acme_owner", org_id: "org_other" }),
    );
    await expectApiError(
      () => foreignOrg.mutation(api.campaigns.create, campaignArgs("Denied")),
      "forbidden",
    );
    await expectApiError(
      () => ada.mutation(api.campaigns.create, campaignArgs("Denied")),
      "forbidden",
    );
    await expectApiError(
      () => t.mutation(api.campaigns.create, campaignArgs("Denied")),
      "not_authenticated",
    );

    const campaigns = await t.run(async (ctx) => ({
      acme: await ctx.db
        .query("campaigns")
        .withIndex("by_companyId", (q) => q.eq("companyId", acmeCampaign.companyId))
        .take(10),
      other: await ctx.db
        .query("campaigns")
        .withIndex("by_companyId", (q) => q.eq("companyId", otherCampaign.companyId))
        .take(10),
    }));
    expect(campaigns.acme.map((campaign) => campaign._id)).toEqual([acmeCampaign._id]);
    expect(campaigns.other.map((campaign) => campaign._id)).toEqual([otherCampaign._id]);
  });

  test("opportunity indexes separate campaign status and respect an explicit deadline window", async () => {
    const { t, acmeCampaign, otherCampaign, acmeOpen, otherOpen } = await seedExamples();
    const results = await t.run(async (ctx) => ({
      acmeOpen: await ctx.db
        .query("opportunities")
        .withIndex("by_campaignId_and_status", (q) =>
          q.eq("campaignId", acmeCampaign._id).eq("status", "open"),
        )
        .take(10),
      otherOpen: await ctx.db
        .query("opportunities")
        .withIndex("by_campaignId_and_status", (q) =>
          q.eq("campaignId", otherCampaign._id).eq("status", "open"),
        )
        .take(10),
      // This is a global operational index query, not a company-facing API.
      dueToday: await ctx.db
        .query("opportunities")
        .withIndex("by_status_and_deadline", (q) =>
          q
            .eq("status", "open")
            .gte("deadline", NOW)
            .lt("deadline", NOW + DAY),
        )
        .take(10),
    }));

    expect(results.acmeOpen.map((opportunity) => opportunity._id)).toEqual([acmeOpen]);
    expect(results.otherOpen.map((opportunity) => opportunity._id)).toEqual([otherOpen]);
    expect(results.dueToday.map((opportunity) => opportunity._id)).toEqual([acmeOpen]);
  });

  test("application and assignment queues filter by creator, opportunity, status, and offer expiry", async () => {
    const { t, acmeOpen, acmePaused, otherOpen, adaId, benId } = await seedExamples();
    const results = await t.run(async (ctx) => {
      const dueNow = await ctx.db.insert("applications", {
        opportunityId: acmeOpen,
        creatorId: adaId,
        note: "SDK demo",
        status: "offered",
        offerExpiresAt: NOW,
      });
      const pending = await ctx.db.insert("applications", {
        opportunityId: acmeOpen,
        creatorId: benId,
        note: "SDK demo",
        status: "pending",
      });
      const overdue = await ctx.db.insert("applications", {
        opportunityId: acmePaused,
        creatorId: benId,
        note: "SDK demo",
        status: "offered",
        offerExpiresAt: NOW - 1,
      });
      const future = await ctx.db.insert("applications", {
        opportunityId: otherOpen,
        creatorId: adaId,
        note: "SDK demo",
        status: "offered",
        offerExpiresAt: NOW + 1,
      });
      await ctx.db.insert("applications", {
        opportunityId: otherOpen,
        creatorId: benId,
        note: "SDK demo",
        status: "accepted",
        acceptedAt: NOW,
      });
      const assignment = (
        opportunityId: Id<"opportunities">,
        creatorId: Id<"creators">,
        status: Doc<"assignments">["status"],
      ): WithoutSystemFields<Doc<"assignments">> => ({
        opportunityId,
        creatorId,
        status,
        fixedFeeCents: 20_000,
        cpmRateCents: 500,
        paymentCapCents: 30_000,
        usesAiReview: false,
      });
      const adaActive = await ctx.db.insert("assignments", assignment(acmeOpen, adaId, "active"));
      await ctx.db.insert("assignments", assignment(acmeOpen, benId, "cancelled"));
      await ctx.db.insert("assignments", assignment(otherOpen, adaId, "completed"));
      const benActive = await ctx.db.insert("assignments", assignment(otherOpen, benId, "active"));

      return {
        dueNow,
        pending,
        overdue,
        future,
        adaActive,
        benActive,
        acmePending: await ctx.db
          .query("applications")
          .withIndex("by_opportunityId_and_status", (q) =>
            q.eq("opportunityId", acmeOpen).eq("status", "pending"),
          )
          .take(10),
        adaOffers: await ctx.db
          .query("applications")
          .withIndex("by_creatorId_and_status", (q) =>
            q.eq("creatorId", adaId).eq("status", "offered"),
          )
          .take(10),
        expiredOffers: await ctx.db
          .query("applications")
          .withIndex("by_status_and_offerExpiresAt", (q) =>
            q.eq("status", "offered").gt("offerExpiresAt", 0).lte("offerExpiresAt", NOW),
          )
          .take(10),
        adaAssignments: await ctx.db
          .query("assignments")
          .withIndex("by_creatorId_and_status", (q) =>
            q.eq("creatorId", adaId).eq("status", "active"),
          )
          .take(10),
        otherAssignments: await ctx.db
          .query("assignments")
          .withIndex("by_opportunityId_and_status", (q) =>
            q.eq("opportunityId", otherOpen).eq("status", "active"),
          )
          .take(10),
      };
    });

    expect(results.acmePending.map((row) => row._id)).toEqual([results.pending]);
    expect(results.adaOffers.map((row) => row._id).sort()).toEqual(
      [results.dueNow, results.future].sort(),
    );
    expect(results.expiredOffers.map((row) => row._id)).toEqual([results.overdue, results.dueNow]);
    expect(results.adaAssignments.map((row) => row._id)).toEqual([results.adaActive]);
    expect(results.otherAssignments.map((row) => row._id)).toEqual([results.benActive]);
  });

  test("delivery joins keep each campaign's posts and dispute participants separate", async () => {
    const { t, acmeCampaign, otherCampaign, acmeOpen, otherOpen, adaId, benId } =
      await seedExamples();
    const results = await t.run(async (ctx) => {
      async function seedDelivery(
        campaign: Doc<"campaigns">,
        opportunityId: Id<"opportunities">,
        creatorId: Id<"creators">,
      ) {
        const assignmentId = await ctx.db.insert("assignments", {
          opportunityId,
          creatorId,
          fixedFeeCents: 20_000,
          cpmRateCents: 500,
          paymentCapCents: 30_000,
          usesAiReview: false,
          status: "active",
        });
        const submissionId = await ctx.db.insert("submissions", {
          assignmentId,
          draftUrl: "https://example.com/draft",
          draftDescription: campaign.title,
          status: "approved",
          reviewerType: "companyUser",
          reviewedBy: campaign.createdBy,
          reviewedAt: NOW,
        });
        const postId = await ctx.db.insert("posts", {
          submissionId,
          url: `https://example.com/posts/${submissionId}`,
          postedAt: NOW,
          isVerified: true,
          likes: 25,
          comments: 5,
          reposts: 3,
          views: 1_500,
          lastUpdatedAt: NOW,
        });
        const creator = (await ctx.db.get("creators", creatorId))!;
        const disputeId = await ctx.db.insert("disputes", {
          assignmentId,
          openedBy: creator.userId,
          reason: "View count mismatch",
          description: "Compare the platform view count.",
          status: "open",
        });
        return { assignmentId, postId, disputeId, creatorUserId: creator.userId };
      }

      const acmeDelivery = await seedDelivery(acmeCampaign, acmeOpen, adaId);
      const otherDelivery = await seedDelivery(otherCampaign, otherOpen, benId);
      const opportunities = await ctx.db
        .query("opportunities")
        .withIndex("by_campaignId_and_status", (q) =>
          q.eq("campaignId", acmeCampaign._id).eq("status", "open"),
        )
        .take(10);
      const assignments = (
        await Promise.all(
          opportunities.map((opportunity) =>
            ctx.db
              .query("assignments")
              .withIndex("by_opportunityId_and_status", (q) =>
                q.eq("opportunityId", opportunity._id).eq("status", "active"),
              )
              .take(10),
          ),
        )
      ).flat();
      const submissions = (
        await Promise.all(
          assignments.map((assignment) =>
            ctx.db
              .query("submissions")
              .withIndex("by_assignmentId", (q) => q.eq("assignmentId", assignment._id))
              .take(10),
          ),
        )
      ).flat();
      const posts = (
        await Promise.all(
          submissions.map((submission) =>
            ctx.db
              .query("posts")
              .withIndex("by_submissionId", (q) => q.eq("submissionId", submission._id))
              .take(10),
          ),
        )
      ).flat();
      const disputes = await ctx.db
        .query("disputes")
        .withIndex("by_assignmentId_and_status", (q) =>
          q.eq("assignmentId", acmeDelivery.assignmentId).eq("status", "open"),
        )
        .take(10);
      const openers = await Promise.all(
        disputes.map((dispute) => ctx.db.get("users", dispute.openedBy)),
      );
      const benDisputes = await ctx.db
        .query("disputes")
        .withIndex("by_openedBy", (q) => q.eq("openedBy", otherDelivery.creatorUserId))
        .take(10);
      return { acmeDelivery, otherDelivery, posts, disputes, openers, benDisputes };
    });

    expect(results.posts.map((post) => post._id)).toEqual([results.acmeDelivery.postId]);
    expect(results.disputes.map((dispute) => dispute._id)).toEqual([
      results.acmeDelivery.disputeId,
    ]);
    expect(results.openers.map((user) => user?.email)).toEqual(["ada@example.com"]);
    expect(results.benDisputes.map((dispute) => dispute._id)).toEqual([
      results.otherDelivery.disputeId,
    ]);
  });
});
