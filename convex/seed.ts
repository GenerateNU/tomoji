import { v } from "convex/values";
import type { Doc, Id, TableNames } from "./_generated/dataModel";
import { env, internalMutation, type MutationCtx } from "./_generated/server";
import { apiError } from "./lib/errors";
import { HALF_HOUR_MS } from "./lib/validation";
import { getCompanyUserByUserId } from "./models/companyUsers";
import { updateCreatorLanguages } from "./models/creatorLanguages";
import { listCreatorNiches, updateCreatorNiches } from "./models/creatorNiches";
import { getCreatorByUserId } from "./models/creators";
import { listCreatorSkills, updateCreatorSkills } from "./models/creatorSkills";
import { creatorName, type NotificationContent } from "./models/notifications";
import { updateOpportunityLanguages } from "./models/opportunityLanguages";
import { updateOpportunityNiches } from "./models/opportunityNiches";
import { scoreOpportunityMatch, type CreatorSignals } from "./models/opportunityMatch";
import { updateOpportunitySkills } from "./models/opportunitySkills";
import { createPayout } from "./models/payouts";
import { getStripeCustomerByCompanyId } from "./models/stripeCustomers";
import { applyMembership, getEmailOwner, normalizeEmail, upsertUser } from "./models/users";

const dayMs = 24 * 60 * 60 * 1000;
const demoCampaignTitle = "[Demo] Northstar Studio launch";
const demoOrg = "org_tomoji_seed_northstar";
const demoCreator = {
  workosId: "user_tomoji_seed_maya",
  email: "maya.chen@tomoji-seed.example",
  firstName: "Maya",
  lastName: "Chen",
};
const demoAdmin = {
  workosId: "user_tomoji_seed_jordan",
  email: "jordan.lee@tomoji-seed.example",
  firstName: "Jordan",
  lastName: "Lee",
};
const matchTags = { niches: ["developer-tools"], skills: ["typescript"] };
const campaignReadLimit = 200;
const catalogReadLimit = 200;
const demoCaption = "From a blank canvas to a shippable prototype with Northstar Studio. #ad";

const seedAccounts = {
  creatorEmail: v.optional(v.string()),
  companyAdminEmail: v.optional(v.string()),
};

/** Requires a deliberate opt-in on the target development deployment. */
function requireDevSeed(): void {
  if (env.TOMOJI_DEV_SEED !== "true")
    throw apiError("invalid_state", { reason: "dev_seed_disabled" });
}

/** Finds the explicitly selected account or creates its reserved synthetic counterpart. */
async function seedUser(
  ctx: MutationCtx,
  email: string | undefined,
  demo: {
    workosId: string;
    email: string;
    firstName: string;
    lastName: string;
  },
  role: "creator" | "company",
) {
  if (email === undefined) {
    const existing = await getEmailOwner(ctx, demo.email);
    if (existing !== null && existing.workosId !== demo.workosId)
      throw apiError("conflict", { reason: "demo_email_in_use" });
    if (existing === null) {
      const userId = await upsertUser(ctx, demo);
      if (role === "company") {
        await applyMembership(ctx, {
          workosUserId: demo.workosId,
          organizationId: demoOrg,
          organizationName: "Northstar Labs (Demo)",
          role: "admin",
        });
      }
      return (await ctx.db.get("users", userId))!;
    }
    email = demo.email;
  }
  const user = await getEmailOwner(ctx, normalizeEmail(email));
  if (user?.role !== role || !user.isActive)
    throw apiError("invalid_state", { reason: "seed_account_not_found", role });
  return user;
}

/** Resolves the campaign, author and creator without choosing arbitrary real accounts. */
async function seedWorkspace(
  ctx: MutationCtx,
  args: {
    creatorEmail?: string;
    companyAdminEmail?: string;
  },
) {
  const creatorUser = await seedUser(ctx, args.creatorEmail, demoCreator, "creator");
  const adminUser = await seedUser(ctx, args.companyAdminEmail, demoAdmin, "company");
  const creator = await getCreatorByUserId(ctx, creatorUser._id);
  if (creator === null) throw apiError("not_found", { resource: "creator" });
  const admin = await getCompanyUserByUserId(ctx, adminUser._id);
  const company = admin && (await ctx.db.get("companies", admin.companyId));
  if (admin?.role !== "admin" || !company?.isActive)
    throw apiError("invalid_state", { reason: "seed_company_admin_required" });

  const campaigns = await ctx.db
    .query("campaigns")
    .withIndex("by_companyId", (q) => q.eq("companyId", company._id))
    .take(campaignReadLimit);
  if (campaigns.length === campaignReadLimit)
    throw apiError("invalid_state", { reason: "too_many_campaigns_to_seed" });
  const campaign = campaigns.find((row) => row.title === demoCampaignTitle) ?? null;

  if (campaign !== null) {
    const existing = await ctx.db
      .query("assignments")
      .withIndex("by_campaignId", (q) => q.eq("campaignId", campaign._id))
      .first();
    if (existing?.creatorId !== creator._id)
      throw apiError("conflict", { reason: "demo_campaign_already_in_use" });
  }

  return {
    creator,
    admin,
    company,
    campaign,
    isSyntheticCreator: creatorUser.workosId === demoCreator.workosId,
    isSyntheticCompany: adminUser.workosId === demoAdmin.workosId,
  };
}

/** Completes a synthetic creator profile so the sample account has meaningful match signals. */
async function fillDemoProfile(ctx: MutationCtx, creatorId: Id<"creators">, now: number) {
  const niches = ["developer-tools", "web-development"];
  const skills = ["typescript", "react"];
  await updateCreatorNiches(ctx, creatorId, niches);
  await updateCreatorSkills(ctx, creatorId, skills);
  await updateCreatorLanguages(ctx, creatorId, ["english"]);
  await ctx.db.patch("creators", creatorId, {
    countryOfResidence: "US",
    followerRange: "10k-50k",
    dateOfBirth: Date.UTC(1998, 4, 16),
    onboardingCompletedAt: now,
  });
  return { niches, skills, followerRange: "10k-50k" as const };
}

/** Populates an isolated profile, including inert X records; never touches a real profile. */
async function seedDemoProfile(ctx: MutationCtx, now: number) {
  const user = await seedUser(
    ctx,
    undefined,
    {
      workosId: "user_tomoji_seed_riley",
      email: "riley.park@tomoji-seed.example",
      firstName: "Riley",
      lastName: "Park",
    },
    "creator",
  );
  const creator = (await getCreatorByUserId(ctx, user._id))!;
  const signals = await fillDemoProfile(ctx, creator._id, now);
  const account = await ctx.db
    .query("xAccounts")
    .withIndex("by_creatorId", (q) => q.eq("creatorId", creator._id))
    .unique();
  if (account === null) {
    const xAccountId = await ctx.db.insert("xAccounts", {
      creatorId: creator._id,
      xUserId: "0",
      username: "riley_demo",
      displayName: "Riley Park (Demo)",
      linkedAt: now - dayMs,
      updatedAt: now,
      status: "reconnect_required",
    });
    // This cannot decrypt or refresh. It represents an expired session, with no actual OAuth material.
    await ctx.db.insert("xAccountCredentials", {
      xAccountId,
      encryptedTokens: {
        ciphertext: new ArrayBuffer(0),
        iv: new ArrayBuffer(0),
        keyVersion: "fixture",
      },
      accessTokenExpiresAt: now - dayMs,
      scopes: [],
      credentialVersion: 1,
    });
    await ctx.db.insert("xLinkAttempts", {
      creatorId: creator._id,
      stateHash: "expired-demo-link",
      redirectUri: "https://tomoji-seed.example/x/callback",
      expiresAt: now - dayMs,
      status: "failed",
    });
  }

  const stripeAccount = await ctx.db
    .query("stripeAccounts")
    .withIndex("by_creatorId", (q) => q.eq("creatorId", creator._id))
    .unique();
  if (stripeAccount === null) {
    // A disconnected demo account with a reconnect in progress. Neither row
    // references a live Stripe account or belongs to a sign-in selected by email.
    await ctx.db.insert("stripeAccounts", {
      creatorId: creator._id,
      stripeAccountId: "acct_tomoji_seed_disconnected",
      detailsSubmitted: false,
      payoutsEnabled: false,
      requirementsDue: false,
      stripeUpdatedAt: now - dayMs,
      disconnectedAt: now - dayMs,
    });
    await ctx.db.insert("stripeAccountCreations", {
      creatorId: creator._id,
      country: "US",
      startedAt: now,
    });
  }

  return { creatorId: creator._id, signals };
}

const compensation = { fixedFeeCents: 25_000, cpmRateCents: 400, paymentCapCents: 100_000 };
const brief = {
  contentRequirements:
    "Show one Northstar Studio workflow from start to finish with the finished result.",
  reviewPolicy: "Disclose the sponsorship with #ad and name Northstar Studio in the caption.",
};

const scenarios = [
  {
    stage: "notStarted",
    title: "First look: build a dashboard",
    task: "Build a dashboard from a starter",
  },
  { stage: "pending", title: "Components in practice", task: "Create and reuse a component" },
  {
    stage: "changesRequested",
    title: "A brief to prototype walkthrough",
    task: "Walk through a brief and show the result",
  },
  {
    stage: "approved",
    title: "A faster way to hand off designs",
    task: "Demonstrate the handoff workflow",
  },
  { stage: "posted", title: "Launch recap", task: "Share the finished prototype" },
  {
    stage: "applying",
    title: "Inside a design systems team",
    task: "Show how your team maintains a component library",
  },
] as const;

type SeedCampaign = Pick<Doc<"campaigns">, "companyId" | "createdBy"> & { _id: Id<"campaigns"> };
type Brief = Pick<
  Doc<"opportunities">,
  "title" | "description" | "deadline" | "isGated" | "usesAiReviewDefault"
>;

/** Creates a discoverable brief and one deliverable with validated taxonomy selections. */
async function seedOpportunity(
  ctx: MutationCtx,
  campaign: SeedCampaign,
  fields: Brief,
  options: {
    niches: string[];
    skills: string[];
    task: string;
  },
) {
  const opportunityId = await ctx.db.insert("opportunities", {
    ...fields,
    ...brief,
    ...compensation,
    companyId: campaign.companyId,
    campaignId: campaign._id,
    createdBy: campaign.createdBy,
    status: "open",
    maxSlots: 8,
    numFilledSlots: 0,
  });
  await updateOpportunityNiches(ctx, opportunityId, options.niches);
  await updateOpportunitySkills(ctx, opportunityId, options.skills);
  await updateOpportunityLanguages(ctx, opportunityId, ["english"]);

  const reviewCriteria = [
    { id: "sponsorship", description: "Disclose the sponsorship with #ad." },
    { id: "product", description: "Name Northstar Studio in the caption." },
  ];
  const deliverableId = await ctx.db.insert("deliverables", {
    opportunityId,
    createdBy: campaign.createdBy,
    title: options.task,
    description: fields.description,
    reviewCriteria,
  });
  return { opportunityId, deliverableId, reviewCriteria };
}

/** The records one scenario created, for notifications that point at them. */
type ScenarioRecords = {
  title: string;
  opportunityId: Id<"opportunities">;
  applicationId: Id<"applications">;
  assignmentId?: Id<"assignments">;
  submissionId?: Id<"submissions">;
};

/** Seeds one complete workflow at the selected point in its lifecycle. */
async function seedScenario(
  ctx: MutationCtx,
  campaign: SeedCampaign,
  creator: Doc<"creators">,
  scenario: (typeof scenarios)[number],
  now: number,
  deadline: number,
): Promise<ScenarioRecords> {
  const usesAiReview =
    scenario.stage === "notStarted" ||
    scenario.stage === "pending" ||
    scenario.stage === "changesRequested";
  const description = `${scenario.task}. Keep the walkthrough under one minute.`;
  const { opportunityId, deliverableId, reviewCriteria } = await seedOpportunity(
    ctx,
    campaign,
    {
      title: scenario.title,
      description,
      deadline,
      isGated: true,
      usesAiReviewDefault: usesAiReview,
    },
    { task: scenario.task, ...matchTags },
  );
  const applicationId = await ctx.db.insert("applications", {
    opportunityId,
    creatorId: creator._id,
    companyId: campaign.companyId,
    note: "I make short tutorials for designers who code.",
    status: scenario.stage === "applying" ? "offered" : "accepted",
    statusLastUpdatedAt: now,
    offerExpiresAt: now + 2 * dayMs,
    offerAcceptedAt: scenario.stage === "applying" ? undefined : now,
  });

  if (scenario.stage === "applying") {
    await ctx.db.insert("opportunityStars", { creatorId: creator._id, opportunityId });
    return { title: scenario.title, opportunityId, applicationId };
  }

  const scope = { creatorId: creator._id, companyId: campaign.companyId, campaignId: campaign._id };
  const assignmentId = await ctx.db.insert("assignments", {
    ...scope,
    ...compensation,
    opportunityId,
    usesAiReview,
    status: scenario.stage === "posted" ? "completed" : "active",
  });
  await ctx.db.patch("opportunities", opportunityId, { numFilledSlots: 1 });

  if (scenario.stage === "notStarted") {
    // An abandoned grant exercises the media table without implying any S3 bytes exist.
    await ctx.db.insert("mediaUploads", {
      ownerUserId: creator.userId,
      kind: "video-submission",
      assignmentId,
      stagingKey: `staging/video-submission/seed-${assignmentId}`,
      contentType: "video/mp4",
      grantExpiresAt: now - dayMs,
      status: "pending",
    });
    return { title: scenario.title, opportunityId, applicationId, assignmentId };
  }

  const draft = {
    assignmentId,
    deliverableId,
    usesAiReview,
    draftDescription: "A one-minute walkthrough with a finished example.",
    caption:
      scenario.stage === "changesRequested" ? "A quick Northstar Studio walkthrough." : demoCaption,
  };
  const review = {
    reviewerType: "companyUser" as const,
    reviewedBy: campaign.createdBy,
    reviewedAt: now,
  };
  const status = scenario.stage === "posted" ? "approved" : scenario.stage;
  const submissionId = await ctx.db.insert(
    "submissions",
    status === "pending"
      ? { ...draft, status }
      : status === "approved"
        ? { ...draft, ...review, status }
        : {
            ...draft,
            reviewerType: "ai",
            reviewedAt: now,
            status,
            reviewNote: "Disclose the sponsorship with #ad.",
          },
  );

  if (status === "pending") {
    // An existing fallback for the company to review; no provider job is enqueued.
    await ctx.db.insert("aiReviewAttempts", {
      submissionId,
      caption: draft.caption,
      criteria: reviewCriteria,
      context: { title: scenario.title, description, ...brief },
      status: "manualReview",
      failureReason: "disabled",
      finishedAt: now,
    });
  }

  if (status === "changesRequested") {
    await ctx.db.insert("aiReviewAttempts", {
      submissionId,
      caption: draft.caption,
      criteria: reviewCriteria,
      context: { title: scenario.title, description, ...brief },
      status: "completed",
      startedAt: now,
      finishedAt: now,
      result: {
        model: "fixture",
        inputTokens: 0,
        outputTokens: 0,
        results: [
          {
            criterionId: "sponsorship",
            outcome: "not_met",
            confidence: 0.98,
            probabilities: { met: 0.01, not_met: 0.98, uncertain: 0.01 },
          },
          {
            criterionId: "product",
            outcome: "met",
            confidence: 0.98,
            probabilities: { met: 0.98, not_met: 0.01, uncertain: 0.01 },
          },
        ],
      },
    });
  }

  if (scenario.stage === "posted") {
    // Explicitly synthetic: the status and metrics are examples, not fetched from X.
    const postId = await ctx.db.insert("posts", {
      submissionId,
      campaignId: campaign._id,
      url: "https://tomoji-seed.example/posts/launch-recap",
      xPostId: `fixture-${submissionId}`,
      isActive: true,
      isVerified: true,
      captionCheck: "match",
      postedAt: now,
      views: 12_500,
      viewsUpdatedAt: now,
      likes: 430,
      comments: 24,
      reposts: 61,
      quotes: 9,
    });
    await createPayout(ctx, {
      assignmentId,
      postId,
      sourceKey: "demo-fixed-fee",
      amount: compensation.fixedFeeCents,
      currency: "usd",
    });
    // An earlier week's views, approved and paid before the dispute opened.
    // The charge is synthetic; no Stripe object has these ids.
    const paid = await createPayout(ctx, {
      assignmentId,
      postId,
      sourceKey: "demo-views-week-1",
      amount: 5_000,
      currency: "usd",
      earningPeriod: { startsAt: now - 10 * dayMs, endsAt: now - 3 * dayMs },
    });
    await ctx.db.patch("payouts", paid._id, {
      approvalStatus: "approved",
      approvalSource: "automatic",
      approvedAt: now,
      paymentStatus: "transferred",
      transferredAt: now,
    });
    await ctx.db.insert("payments", {
      payoutId: paid._id,
      attempt: 1,
      stripeAccountId: "acct_tomoji_seed",
      stripePaymentIntentId: `pi_tomoji_seed_${paid._id}`,
      status: "succeeded",
      stripeFee: 175,
      creatorNet: 4_825,
      settlementCurrency: "usd",
    });
    await ctx.db.insert("disputes", {
      ...scope,
      assignmentId,
      postId,
      openedBy: creator.userId,
      openedByRole: "creator",
      reason: "payoutAmount",
      description:
        "The payout shows the base fee. Can you confirm when the view bonus is included?",
      status: "open",
    });
  }

  return { title: scenario.title, opportunityId, applicationId, assignmentId, submissionId };
}

type Stage = (typeof scenarios)[number]["stage"];
type SeedNotification = NotificationContent & { isRead: boolean };

/**
 * One notification per type whose target page exists, for the creator and the
 * company admin, read and unread, each pointing at the scenario it describes.
 * Titles follow the templates in `models/`. Dispute notifications are left out
 * until `notificationHref` links disputes, since clicking one would open nothing.
 */
async function seedNotifications(
  ctx: MutationCtx,
  creator: Doc<"creators">,
  admin: Doc<"companyUsers">,
  campaign: Pick<Doc<"campaigns">, "_id" | "title">,
  records: Map<Stage, ScenarioRecords>,
) {
  const missing = () => apiError("invalid_state", { reason: "seed_scenario_missing" });
  const scenario = (stage: Stage) => {
    const record = records.get(stage);
    if (record === undefined) throw missing();
    return record;
  };
  const submission = (stage: "pending" | "changesRequested" | "approved") => {
    const { assignmentId, submissionId, title } = scenario(stage);
    if (assignmentId === undefined || submissionId === undefined) throw missing();
    return { title, target: { kind: "submission" as const, submissionId, assignmentId } };
  };

  const name = (await creatorName(ctx, creator._id)) || "A creator";
  const offer = scenario("applying");
  const application = {
    kind: "application" as const,
    applicationId: offer.applicationId,
    opportunityId: offer.opportunityId,
  };
  const started = scenario("notStarted");
  if (started.assignmentId === undefined) throw missing();
  const assignment = { kind: "assignment" as const, assignmentId: started.assignmentId };
  const pending = submission("pending");
  const revision = submission("changesRequested");
  const approved = submission("approved");

  // Oldest first: the list is newest first, so the unread rows land on top.
  const toCreator: SeedNotification[] = [
    {
      type: "applicationRejected",
      title: `Your application for ${offer.title} wasn't accepted`,
      target: application,
      isRead: true,
    },
    {
      type: "applicationOpportunityClosed",
      title: `${offer.title} has closed`,
      target: application,
      isRead: true,
    },
    {
      type: "applicationOfferExpired",
      title: `Your offer for ${offer.title} expired`,
      target: application,
      isRead: true,
    },
    {
      type: "assignmentCancelled",
      title: `Your assignment for ${started.title} was cancelled`,
      target: assignment,
      isRead: true,
    },
    {
      type: "submissionApproved",
      title: `Your draft for ${approved.title} was approved`,
      target: approved.target,
      isRead: true,
    },
    {
      type: "payoutStripeSetupNeeded",
      title: "A $250 payment is waiting for your Stripe setup",
      body: "Finish setting up Stripe to get paid.",
      target: assignment,
      isRead: true,
    },
    {
      type: "applicationOpportunityFull",
      title: `${offer.title} has filled all its slots`,
      target: application,
      isRead: false,
    },
    {
      type: "submissionChangesRequested",
      title: `Changes requested on your draft for ${revision.title}`,
      body: "Disclose the sponsorship with #ad.",
      target: revision.target,
      isRead: false,
    },
    {
      type: "applicationOffered",
      title: `You received an offer for ${offer.title}`,
      body: "Accept before the offer expires.",
      target: application,
      isRead: false,
    },
  ];
  const toAdmin: SeedNotification[] = [
    {
      type: "campaignClosed",
      title: `${campaign.title} ended`,
      target: { kind: "campaign", campaignId: campaign._id },
      isRead: true,
    },
    {
      type: "applicationDeclined",
      title: `${name} declined your offer for ${offer.title}`,
      target: application,
      isRead: true,
    },
    {
      type: "applicationOfferExpired",
      title: `${name}'s offer for ${offer.title} expired unanswered`,
      target: application,
      isRead: true,
    },
    {
      type: "assignmentTermsDeclined",
      title: `${name} declined terms for ${started.title}`,
      target: assignment,
      isRead: true,
    },
    {
      type: "applicationAccepted",
      title: `${name} accepted your offer for ${started.title}`,
      target: assignment,
      isRead: true,
    },
    {
      type: "assignmentClaimed",
      title: `${name} joined ${started.title}`,
      target: assignment,
      isRead: true,
    },
    {
      type: "assignmentTermsAccepted",
      title: `${name} accepted terms for ${started.title}`,
      target: assignment,
      isRead: true,
    },
    {
      type: "submissionResubmitted",
      title: `${name} resubmitted a draft for ${revision.title}`,
      target: revision.target,
      isRead: true,
    },
    {
      type: "payoutPaymentFailed",
      title: `Payment of $250 to ${name} failed`,
      body: "The company card was declined (insufficient_funds). Update it in settings.",
      target: assignment,
      isRead: true,
    },
    // Operators get this one; the demo admin shows it so every type renders.
    {
      type: "payoutChargedTwice",
      title: `A $250 payout to ${name} was charged twice`,
      target: assignment,
      isRead: true,
    },
    {
      type: "opportunityClosed",
      title: `${offer.title} closed at its deadline`,
      target: { kind: "opportunity", opportunityId: offer.opportunityId },
      isRead: false,
    },
    {
      type: "applicationReceived",
      title: `${name} applied to ${offer.title}`,
      target: application,
      isRead: false,
    },
    {
      type: "submissionCreated",
      title: `A draft for ${pending.title} needs your review`,
      target: pending.target,
      isRead: false,
    },
  ];
  for (const notification of toCreator)
    await ctx.db.insert("notifications", { ...notification, userId: creator.userId });
  for (const notification of toAdmin)
    await ctx.db.insert("notifications", { ...notification, userId: admin.userId });
}

/** Uses the same matching rules as discovery, without scheduling scoring jobs. */
async function seedScore(
  ctx: MutationCtx,
  creatorId: Id<"creators">,
  signals: CreatorSignals,
  opportunityId: Id<"opportunities">,
) {
  const score = scoreOpportunityMatch(signals, matchTags);
  if (score > 0) await ctx.db.insert("opportunityScores", { creatorId, opportunityId, score });
}

/**
 * Creates an all-table dataset in one transaction. Retrying returns the existing
 * campaign and preserves any changes made while testing against it.
 */
export const run = internalMutation({
  args: seedAccounts,
  returns: v.object({
    created: v.boolean(),
    campaignId: v.id("campaigns"),
    companyId: v.id("companies"),
    creatorId: v.id("creators"),
  }),
  handler: async (ctx, args) => {
    requireDevSeed();
    const { creator, admin, company, campaign, isSyntheticCreator, isSyntheticCompany } =
      await seedWorkspace(ctx, args);
    const ids = { companyId: company._id, creatorId: creator._id };
    if (campaign !== null) return { ...ids, campaignId: campaign._id, created: false };

    const now = Date.now();
    const campaignFields = { companyId: company._id, createdBy: admin._id };
    const campaignId = await ctx.db.insert("campaigns", {
      ...campaignFields,
      title: demoCampaignTitle,
      description: "A collection of creator tutorials for the Northstar Studio launch.",
      status: "open",
      budgetCents: 900_000,
      startsAt: now - dayMs,
    });
    const demoProfile = await seedDemoProfile(ctx, now);
    const signals = isSyntheticCreator
      ? await fillDemoProfile(ctx, creator._id, now)
      : {
          niches: await listCreatorNiches(ctx, creator._id),
          skills: await listCreatorSkills(ctx, creator._id),
          followerRange: creator.followerRange,
        };
    const records = new Map<Stage, ScenarioRecords>();
    for (const [index, scenario] of scenarios.entries()) {
      const deadline = Math.ceil((now + (7 + index) * dayMs) / HALF_HOUR_MS) * HALF_HOUR_MS;
      const record = await seedScenario(
        ctx,
        { ...campaignFields, _id: campaignId },
        creator,
        scenario,
        now,
        deadline,
      );
      records.set(scenario.stage, record);
      await seedScore(ctx, demoProfile.creatorId, demoProfile.signals, record.opportunityId);
      await seedScore(ctx, creator._id, signals, record.opportunityId);
    }
    await seedNotifications(
      ctx,
      creator,
      admin,
      { _id: campaignId, title: demoCampaignTitle },
      records,
    );

    // A historical invitation record, not a pending WorkOS invite someone can accept.
    await ctx.db.insert("invites", {
      workosId: `invite_tomoji_seed_${campaignId}`,
      email: "sam.rivera@tomoji-seed.example",
      kind: "companyUser",
      companyId: company._id,
      role: "member",
      expiresAt: now - dayMs,
    });

    // Only the synthetic company: a real one's card setup would reuse this
    // customer, which doesn't exist in Stripe. No card, so it shows `missing`.
    if (isSyntheticCompany && (await getStripeCustomerByCompanyId(ctx, company._id)) === null) {
      await ctx.db.insert("stripeCustomers", {
        companyId: company._id,
        stripeCustomerId: "cus_tomoji_seed",
        stripeUpdatedAt: now,
      });
    }

    return { ...ids, campaignId, created: true };
  },
});

const MORE_TOPICS = [
  {
    topic: "Edge functions",
    niches: ["cloud-computing", "web-development"],
    skills: ["typescript", "nodejs"],
  },
  {
    topic: "Local-first sync",
    niches: ["databases", "frontend-development"],
    skills: ["react", "sql"],
  },
  { topic: "Fine-tuning small models", niches: ["machine-learning", "llms"], skills: ["python"] },
  {
    topic: "Terminal power tools",
    niches: ["developer-tools", "operating-systems-linux"],
    skills: ["bash-shell", "rust"],
  },
  {
    topic: "Agent evals",
    niches: ["ai-agents", "software-testing-qa"],
    skills: ["python", "typescript"],
  },
  { topic: "Mobile offline mode", niches: ["mobile-development"], skills: ["swift", "kotlin"] },
  { topic: "Kubernetes in ten minutes", niches: ["devops", "cloud-computing"], skills: ["go"] },
  {
    topic: "Accessible forms",
    niches: ["frontend-development", "design"],
    skills: ["html", "accessibility"],
  },
  {
    topic: "Realtime multiplayer",
    niches: ["game-dev", "web-development"],
    skills: ["websockets", "typescript"],
  },
  {
    topic: "Data pipelines",
    niches: ["data-engineering", "data-science"],
    skills: ["python", "sql"],
  },
  {
    topic: "Shipping a SaaS solo",
    niches: ["startups", "freelancing-indie-hacking"],
    skills: ["nextjs"],
  },
  {
    topic: "Securing your API",
    niches: ["cybersecurity", "api-development"],
    skills: ["rest-apis", "graphql"],
  },
] as const;

const MORE_FORMATS = [
  "walkthrough",
  "first look",
  "build-along",
  "explainer",
  "deep dive",
] as const;

/** Ensures the seed campaign has at least count additional briefs for pagination tests. */
export const more = internalMutation({
  args: { ...seedAccounts, count: v.optional(v.number()) },
  returns: v.object({ added: v.number() }),
  handler: async (ctx, args) => {
    requireDevSeed();
    const { campaign } = await seedWorkspace(ctx, args);
    if (campaign?.status !== "open") throw apiError("invalid_state", { reason: "run_seed_first" });
    const count = args.count ?? 30;
    if (!Number.isInteger(count) || count < 1 || count > 100)
      throw apiError("invalid_state", { reason: "invalid_seed_catalog_count" });
    const catalog = await ctx.db
      .query("opportunities")
      .withIndex("by_campaignId_and_status", (q) => q.eq("campaignId", campaign._id))
      .take(catalogReadLimit);
    if (catalog.length === catalogReadLimit)
      throw apiError("invalid_state", { reason: "too_many_opportunities_to_seed" });
    const titles = new Set(catalog.map((row) => row.title));
    const deadline = Math.ceil((Date.now() + 21 * dayMs) / HALF_HOUR_MS) * HALF_HOUR_MS;
    let added = 0;
    for (let index = 0; index < count; index++) {
      const { topic, niches, skills } = MORE_TOPICS[index % MORE_TOPICS.length];
      const format = MORE_FORMATS[Math.floor(index / MORE_TOPICS.length) % MORE_FORMATS.length];
      const number = Math.floor(index / (MORE_TOPICS.length * MORE_FORMATS.length)) + 1;
      const title = `[Catalog] ${topic}: ${format}${number === 1 ? "" : ` ${number}`}`;
      if (titles.has(title)) continue;
      await seedOpportunity(
        ctx,
        campaign,
        {
          title,
          description: `A ${format} for developers working on ${topic.toLowerCase()}.`,
          deadline,
          isGated: index % 3 === 0,
          usesAiReviewDefault: false,
        },
        {
          task: `Record a ${format} on ${topic.toLowerCase()}`,
          niches: [...niches],
          skills: [...skills],
        },
      );
      added++;
    }
    return { added };
  },
});

/**
 * Deletes the demo campaign and everything the seed hung off it, so a later run
 * can rebuild it against a different account. An invite marker ties the
 * reset to the campaign created by the seed.
 */
export const clearDemo = internalMutation({
  args: {},
  returns: v.object({ campaigns: v.number(), documents: v.number() }),
  handler: async (ctx) => {
    requireDevSeed();
    const all = await ctx.db.query("campaigns").take(campaignReadLimit);
    if (all.length === campaignReadLimit)
      throw apiError("invalid_state", { reason: "too_many_campaigns_to_seed" });
    const demos = [];
    for (const campaign of all) {
      const marker = await ctx.db
        .query("invites")
        .withIndex("by_workosId", (q) => q.eq("workosId", `invite_tomoji_seed_${campaign._id}`))
        .unique();
      if (marker?.companyId === campaign.companyId) demos.push({ campaign, marker });
    }

    let documents = 0;
    const removed = {
      campaigns: new Set<string>(),
      opportunities: new Set<string>(),
      applications: new Set<string>(),
      assignments: new Set<string>(),
      submissions: new Set<string>(),
      disputes: new Set<string>(),
    };
    const userIds = new Set<Id<"users">>();

    async function drop<T extends TableNames>(table: T, rows: { _id: Id<T> }[]) {
      for (const row of rows) {
        await ctx.db.delete(table, row._id);
        documents++;
      }
    }

    for (const { campaign, marker } of demos) {
      const opportunities = await ctx.db
        .query("opportunities")
        .withIndex("by_campaignId_and_deadline", (q) => q.eq("campaignId", campaign._id))
        .collect();
      const assignments = await ctx.db
        .query("assignments")
        .withIndex("by_campaignId", (q) => q.eq("campaignId", campaign._id))
        .collect();
      const creatorIds = new Set(assignments.map((row) => row.creatorId));

      for (const { _id: opportunityId } of opportunities) {
        removed.opportunities.add(opportunityId);
        for (const table of [
          "opportunityNiches",
          "opportunitySkills",
          "opportunityLanguages",
          "opportunityScores",
          "deliverables",
        ] as const) {
          await drop(
            table,
            await ctx.db
              .query(table)
              .withIndex("by_opportunityId", (q) => q.eq("opportunityId", opportunityId))
              .collect(),
          );
        }
        const applications = await ctx.db
          .query("applications")
          .withIndex("by_opportunityId_and_creatorId", (q) => q.eq("opportunityId", opportunityId))
          .collect();
        for (const row of applications) {
          removed.applications.add(row._id);
          creatorIds.add(row.creatorId);
        }
        await drop("applications", applications);
        // Stars are indexed by creator, so each known creator is checked in turn.
        for (const creatorId of creatorIds) {
          await drop(
            "opportunityStars",
            await ctx.db
              .query("opportunityStars")
              .withIndex("by_creatorId_and_opportunityId", (q) =>
                q.eq("creatorId", creatorId).eq("opportunityId", opportunityId),
              )
              .collect(),
          );
        }
      }

      for (const { _id: assignmentId } of assignments) {
        removed.assignments.add(assignmentId);
        const submissions = await ctx.db
          .query("submissions")
          .withIndex("by_assignmentId_and_deliverableId", (q) => q.eq("assignmentId", assignmentId))
          .collect();
        for (const { _id: submissionId } of submissions) {
          removed.submissions.add(submissionId);
          await drop(
            "aiReviewAttempts",
            await ctx.db
              .query("aiReviewAttempts")
              .withIndex("by_submissionId", (q) => q.eq("submissionId", submissionId))
              .collect(),
          );
          const posts = await ctx.db
            .query("posts")
            .withIndex("by_submissionId_and_isActive", (q) => q.eq("submissionId", submissionId))
            .collect();
          for (const { _id: postId } of posts) {
            const postDisputes = await ctx.db
              .query("disputes")
              .withIndex("by_postId", (q) => q.eq("postId", postId))
              .collect();
            for (const row of postDisputes) removed.disputes.add(row._id);
            await drop("disputes", postDisputes);
          }
          await drop("posts", posts);
        }
        await drop("submissions", submissions);
        const disputes = await ctx.db
          .query("disputes")
          .withIndex("by_assignmentId", (q) => q.eq("assignmentId", assignmentId))
          .collect();
        for (const row of disputes) removed.disputes.add(row._id);
        await drop("disputes", disputes);
        const payouts = await ctx.db
          .query("payouts")
          .withIndex("by_assignmentId_and_sourceKey", (q) => q.eq("assignmentId", assignmentId))
          .collect();
        for (const { _id: payoutId } of payouts) {
          await drop(
            "payments",
            await ctx.db
              .query("payments")
              .withIndex("by_payoutId_and_attempt", (q) => q.eq("payoutId", payoutId))
              .collect(),
          );
        }
        await drop("payouts", payouts);
      }
      await drop("assignments", assignments);
      await drop("opportunities", opportunities);

      await drop("invites", [marker]);

      for (const creatorId of creatorIds) {
        const creator = await ctx.db.get("creators", creatorId);
        if (creator !== null) userIds.add(creator.userId);
      }
      const members = await ctx.db
        .query("companyUsers")
        .withIndex("by_companyId", (q) => q.eq("companyId", campaign.companyId))
        .collect();
      for (const member of members) userIds.add(member.userId);

      removed.campaigns.add(campaign._id);
      await drop("campaigns", [campaign]);
    }

    // Grants carry no index, so the whole table is matched against the assignments.
    const media = await ctx.db.query("mediaUploads").collect();
    await drop(
      "mediaUploads",
      media.filter((row) => row.assignmentId && removed.assignments.has(row.assignmentId)),
    );

    for (const userId of userIds) {
      const rows = await ctx.db
        .query("notifications")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .collect();
      await drop(
        "notifications",
        rows.filter(({ target }) => {
          switch (target.kind) {
            case "application":
              return removed.applications.has(target.applicationId);
            case "assignment":
              return removed.assignments.has(target.assignmentId);
            case "submission":
              return removed.submissions.has(target.submissionId);
            case "opportunity":
              return removed.opportunities.has(target.opportunityId);
            case "campaign":
              return removed.campaigns.has(target.campaignId);
            case "dispute":
              return removed.disputes.has(target.disputeId);
          }
        }),
      );
    }

    return { campaigns: demos.length, documents };
  },
});
