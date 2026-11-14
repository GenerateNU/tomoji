import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { env, internalMutation, type MutationCtx } from "./_generated/server";
import { apiError } from "./lib/errors";
import { HALF_HOUR_MS } from "./lib/validation";
import { getCompanyUserByUserId } from "./models/companyUsers";
import { updateCreatorLanguages } from "./models/creatorLanguages";
import { listCreatorNiches, updateCreatorNiches } from "./models/creatorNiches";
import { getCreatorByUserId } from "./models/creators";
import { listCreatorSkills, updateCreatorSkills } from "./models/creatorSkills";
import { createNotification, notifyCompanyUser } from "./models/notifications";
import { updateOpportunityLanguages } from "./models/opportunityLanguages";
import { updateOpportunityNiches } from "./models/opportunityNiches";
import { scoreOpportunityMatch, type CreatorSignals } from "./models/opportunityScores";
import { updateOpportunitySkills } from "./models/opportunitySkills";
import { createPayout } from "./models/payouts";
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

/** Seeds one complete workflow at the selected point in its lifecycle. */
async function seedScenario(
  ctx: MutationCtx,
  campaign: SeedCampaign,
  creator: Doc<"creators">,
  scenario: (typeof scenarios)[number],
  now: number,
  deadline: number,
) {
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
    await createNotification(ctx, creator.userId, {
      type: "applicationOffered",
      title: "Northstar Studio sent you an offer",
      body: scenario.title,
      target: { kind: "application", applicationId, opportunityId },
    });
    return opportunityId;
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
    return opportunityId;
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
    await notifyCompanyUser(ctx, campaign.createdBy, {
      type: "submissionCreated",
      title: "A Northstar Studio draft needs review",
      target: { kind: "submission", submissionId, assignmentId },
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
    await createNotification(ctx, creator.userId, {
      type: "submissionChangesRequested",
      title: "Changes requested for your Northstar Studio draft",
      target: { kind: "submission", submissionId, assignmentId },
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

  return opportunityId;
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
    const { creator, admin, company, campaign, isSyntheticCreator } = await seedWorkspace(
      ctx,
      args,
    );
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
    for (const [index, scenario] of scenarios.entries()) {
      const deadline = Math.ceil((now + (7 + index) * dayMs) / HALF_HOUR_MS) * HALF_HOUR_MS;
      const opportunityId = await seedScenario(
        ctx,
        { ...campaignFields, _id: campaignId },
        creator,
        scenario,
        now,
        deadline,
      );
      await seedScore(ctx, demoProfile.creatorId, demoProfile.signals, opportunityId);
      await seedScore(ctx, creator._id, signals, opportunityId);
    }

    // A historical invitation record, not a pending WorkOS invite someone can accept.
    await ctx.db.insert("invites", {
      workosId: `invite_tomoji_seed_${campaignId}`,
      email: "sam.rivera@tomoji-seed.example",
      kind: "companyUser",
      companyId: company._id,
      role: "member",
      expiresAt: now - dayMs,
    });

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
