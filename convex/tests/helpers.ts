import type { TestConvex as ConvexTest } from "convex-test";
import type { UserIdentity, WithoutSystemFields } from "convex/server";
import type { Infer } from "convex/values";
import { expect } from "vitest";
import type { Doc, Id } from "../_generated/dataModel";
import type { DeliverableCreate } from "../models/deliverableDrafts";
import { createSubmission, type SubmissionDraft } from "../models/submissions";
import type { ApiErrorCode } from "../lib/errors";
import {
  claimAiReviewAttempt,
  recordAiTranscriptionJob,
  saveAiTranscription,
} from "../models/aiReviewAttempts";
import type { aiReviewResult } from "../lib/ai/validation";
import type { Transcription } from "../lib/ai/assemblyAi";
import { companyContext } from "../lib/functions";
import { getCreatorByUserId } from "../models/creators";
import { upsertXAccount, type XAccountLink } from "../models/xAccounts";
import { encryptXTokens } from "../lib/xTokenEncryption";
import { createCampaign } from "../models/campaigns";
import { createPost, verifyPost } from "../models/posts";
import { recordPostViewSnapshot } from "../models/earningSources";
import { createOpportunity, type OpportunityCreate } from "../models/opportunities";
import { finalizeMediaUpload, reserveMediaUpload } from "../models/media";
import { applyMembership, getUserByWorkosId, requireUser, upsertUser } from "../models/users";
import type { companyRole } from "../schemas/companyUsers.schema";
import type schema from "../schema";
import type { submissionStatus } from "../schemas/submissions.schema";

export type TestConvex = ConvexTest<typeof schema>;

/** Builds a completed transcription response using synthetic speech and millisecond timestamps. */
export function assemblyTranscriptResponse(overrides: Record<string, unknown> = {}): Response {
  return Response.json({
    id: "transcript-1",
    status: "completed",
    text: "Try Driftwood.",
    words: [
      { text: "Try", start: 100, end: 300 },
      { text: "Driftwood.", start: 300, end: 900 },
    ],
    audio_duration: 2,
    speech_model_used: "universal-2",
    ...overrides,
  });
}

/** Builds a single-criterion Jev response without invoking a live model. */
export function jevReviewResponse(overrides: Record<string, unknown> = {}): Response {
  return Response.json({
    model: "jev-1.14.0",
    answers: {
      criterion_0: {
        type: "choice",
        choice: "uncertain",
        confidence: 0.3,
        probabilities: { met: 0.3, not_met: 0.3, uncertain: 0.4 },
      },
    },
    usage: { input_tokens: 200, output_tokens: 10 },
    ...overrides,
  });
}

/** Reads a seeded user for direct model tests. */
export async function requireSeededUser(t: TestConvex, subject: string) {
  return await t.run(async (ctx) => {
    const user = await getUserByWorkosId(ctx, subject);
    if (user === null) throw new Error("expected seeded user");
    return user;
  });
}

// Synthetic key material only. Never use this fixture on a deployment.
export const X_TOKEN_TEST_CONFIG = {
  X_TOKEN_ENCRYPTION_KEY_VERSION: "v1",
  X_TOKEN_ENCRYPTION_KEYS: JSON.stringify({ v1: btoa("a".repeat(32)) }),
};

type TestXAccountLink = Omit<XAccountLink, "encryptedTokens"> & {
  accessToken: string;
  refreshToken: string;
};

/** Encrypts synthetic provider tokens for direct model tests, never live credentials. */
export async function xAccountLinkArgs(
  creatorId: Id<"creators">,
  overrides: Partial<TestXAccountLink> = {},
): Promise<XAccountLink> {
  const { accessToken, refreshToken, ...metadata } = {
    xUserId: "123456789",
    username: "ada",
    displayName: "Ada Lovelace",
    accessToken: "test-access-token",
    refreshToken: "test-refresh-token",
    accessTokenExpiresAt: Date.now() + 7_200_000,
    scopes: ["tweet.read", "users.read", "offline.access"],
    ...overrides,
  };
  return {
    ...metadata,
    encryptedTokens: await encryptXTokens(
      creatorId,
      { accessToken, refreshToken },
      X_TOKEN_TEST_CONFIG,
    ),
  };
}

/** Seeds a creator and a verified connection through the model, without calling X. */
export async function seedXAccount(
  t: TestConvex,
  subject: string,
  overrides: Partial<TestXAccountLink> = {},
) {
  const existingUser = await t.run((ctx) => getUserByWorkosId(ctx, subject));
  const creatorId =
    existingUser === null
      ? await seedCreatorId(t, subject)
      : await t.run(async (ctx) => {
          const creator = await getCreatorByUserId(ctx, existingUser._id);
          if (creator === null) throw new Error("expected seeded creator");
          return creator._id;
        });
  const link = await xAccountLinkArgs(creatorId, overrides);
  const account = await t.run(async (ctx) => await upsertXAccount(ctx, creatorId, link));
  return { creatorId, account, asCreator: t.withIdentity(workosIdentity({ subject })) };
}

/** Produces a synthetic X token exchange response, never live credentials. */
export function xTokenResponse() {
  return Response.json({
    access_token: "new-access",
    refresh_token: "new-refresh",
    token_type: "bearer",
    expires_in: 7200,
    scope: "tweet.read users.read offline.access",
  });
}

/** Produces an X identity whose ID must retain string precision. */
export function xIdentityResponse() {
  return Response.json({
    data: { id: "12345678901234567890", username: "ada", name: "Ada Lovelace" },
  });
}

/** Seeds an owned picture grant, optionally completing it without contacting S3. */
export async function seedProfilePictureUpload(
  t: TestConvex,
  subject: string,
  status: "pending" | "complete" = "pending",
) {
  const asCreator = await seedUser(t, { subject });
  const uploadId = await asCreator.run(async (ctx) => {
    const { user } = await requireUser(ctx);
    const stagingKey = "staging/profile-picture/11111111-1111-4111-8111-111111111111";
    const uploadId = await reserveMediaUpload(ctx, user, {
      kind: "profile-picture",
      stagingKey,
      contentType: "image/webp",
      grantExpiresAt: Date.now() + 15 * 60_000,
    });
    if (status === "complete") {
      await finalizeMediaUpload(ctx, user, uploadId, {
        stagingKey,
        permanentKey: "media/profile-picture/22222222-2222-4222-8222-222222222222",
        contentType: "image/webp",
        sizeBytes: 3,
      });
    }
    return uploadId;
  });
  return { asCreator, uploadId };
}

/** Reads bounded workflow fixtures so tests can assert that opportunity transitions preserve them. */
export async function readOpportunityHistory(t: TestConvex, opportunityId: Id<"opportunities">) {
  return await t.run(async (ctx) => ({
    applications: await ctx.db
      .query("applications")
      .withIndex("by_opportunityId_and_status", (q) => q.eq("opportunityId", opportunityId))
      .take(4),
    assignments: await ctx.db
      .query("assignments")
      .withIndex("by_opportunityId_and_status", (q) => q.eq("opportunityId", opportunityId))
      .take(2),
  }));
}

/** Seeds pending, offered, and accepted applications plus independently agreed assignment terms. */
export async function seedOpportunityHistory(t: TestConvex, opportunityId: Id<"opportunities">) {
  for (const status of ["pending", "offered", "accepted"] as const) {
    const creatorId = await seedCreatorId(t, `history_${status}`);
    await t.run(async (ctx) => {
      const opportunity = await ctx.db.get("opportunities", opportunityId);
      if (opportunity === null) throw new Error("expected seeded opportunity");
      await ctx.db.insert("applications", {
        opportunityId,
        creatorId,
        companyId: opportunity.companyId,
        note: "Interested in the brief",
        status,
        ...(status !== "pending"
          ? { statusLastUpdatedAt: Date.now(), offerExpiresAt: Date.now() + 172_800_000 }
          : {}),
        ...(status === "accepted" ? { offerAcceptedAt: Date.now() } : {}),
      });
      if (status === "accepted") {
        const opportunity = await ctx.db.get("opportunities", opportunityId);
        if (opportunity === null) throw new Error("expected seeded opportunity");
        await ctx.db.insert("assignments", {
          opportunityId,
          creatorId,
          companyId: opportunity.companyId,
          campaignId: opportunity.campaignId,
          fixedFeeCents: 20_000,
          cpmRateCents: 700,
          paymentCapCents: 40_000,
          usesAiReview: false,
          status: "active",
        });
        await ctx.db.patch("opportunities", opportunityId, { numFilledSlots: 1 });
      }
    });
  }
  return await readOpportunityHistory(t, opportunityId);
}

/** Reads small selection fixtures directly, independently of response mappers. */
export async function readOpportunitySelections(t: TestConvex, opportunityId: Id<"opportunities">) {
  return await t.run(async (ctx) => ({
    opportunity: await ctx.db.get("opportunities", opportunityId),
    niches: await ctx.db
      .query("opportunityNiches")
      .withIndex("by_opportunityId", (q) => q.eq("opportunityId", opportunityId))
      .take(10),
    skills: await ctx.db
      .query("opportunitySkills")
      .withIndex("by_opportunityId", (q) => q.eq("opportunityId", opportunityId))
      .take(10),
  }));
}

/** A fake WorkOS token. */
export function workosIdentity(claims: {
  subject: string;
  email?: string;
  name?: string;
  org_id?: string;
  role?: string;
}): Partial<UserIdentity> {
  return claims as Partial<UserIdentity>;
}

/** Asserts a call fails with the expected code and optional reason, executing it once. */
export async function expectApiError(
  call: () => Promise<unknown>,
  code: ApiErrorCode,
  reason?: string,
) {
  await expect(call()).rejects.toMatchObject({
    data: { code, ...(reason === undefined ? {} : { reason }) },
  });
}

export type SeedOptions = {
  subject: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  org?: { id: string; name?: string; role?: Infer<typeof companyRole> };
};

/**
 * Applies the webhook handlers' effects directly, then returns a client
 * carrying the matching token.
 */
export async function seedUser(t: TestConvex, opts: SeedOptions) {
  await t.run(async (ctx) => {
    await upsertUser(ctx, {
      workosId: opts.subject,
      email: opts.email ?? `${opts.subject}@example.com`,
      firstName: opts.firstName ?? "Test",
      lastName: opts.lastName ?? "",
    });
    if (opts.org) {
      await applyMembership(ctx, {
        workosUserId: opts.subject,
        organizationId: opts.org.id,
        organizationName: opts.org.name ?? "Acme",
        role: opts.org.role ?? "member",
      });
    }
  });

  return t.withIdentity(
    workosIdentity({
      subject: opts.subject,
      org_id: opts.org?.id,
      role: opts.org?.role,
    }),
  );
}

/** Seeds a creator account and returns its creator document ID. */
export async function seedCreatorId(t: TestConvex, subject: string): Promise<Id<"creators">> {
  await seedUser(t, { subject });
  return await t.run(async (ctx) => {
    const user = await getUserByWorkosId(ctx, subject);
    if (user === null) throw new Error("expected seeded user");
    const creator = await getCreatorByUserId(ctx, user._id);
    if (creator === null) throw new Error("expected seeded creator");
    return creator._id;
  });
}

/** Seeds an operator and returns a client carrying the matching token. */
export async function seedOperator(t: TestConvex, subject: string) {
  const asOperator = await seedUser(t, { subject });
  await t.run(async (ctx) => {
    const user = await getUserByWorkosId(ctx, subject);
    if (user === null) throw new Error("expected seeded user");
    await ctx.db.patch("users", user._id, { role: "operator" });
  });
  return asOperator;
}

/** Seeds an operator and returns their user document ID. */
export async function seedOperatorId(t: TestConvex, subject: string): Promise<Id<"users">> {
  await seedOperator(t, subject);
  return await t.run(async (ctx) => {
    const user = await getUserByWorkosId(ctx, subject);
    if (user === null) throw new Error("expected seeded operator");
    return user._id;
  });
}

/**
 * Seeds a member of `org_acme` and returns a client whose token claims
 * `org_other`, an org they do not belong to.
 */
export async function seedWrongOrgCaller(t: TestConvex) {
  await seedUser(t, { subject: "outsider", org: { id: "org_acme" } });
  await seedUser(t, {
    subject: "insider",
    org: { id: "org_other", name: "Other" },
  });
  return t.withIdentity(workosIdentity({ subject: "outsider", org_id: "org_other" }));
}

export type SeedCampaignOptions = {
  subject: string;
  orgId?: string;
  role?: Infer<typeof companyRole>;
  status?: Doc<"campaigns">["status"];
};

// Derive fixtures from the model without routing their types back through the generated API.
type CampaignArgs = Omit<
  Parameters<typeof createCampaign>[1],
  "companyId" | "createdBy" | "status"
> & {
  status: "draft" | "open";
};

/** Builds client-editable campaign fields; raw fixtures add owner/state overrides separately. */
export function campaignArgs(overrides: Partial<CampaignArgs> = {}): CampaignArgs {
  return {
    title: "Spring launch",
    description: "Campaign supporting the spring launch.",
    status: "open",
    budgetCents: 250_000,
    startsAt: Date.now(),
    ...overrides,
  };
}

/** Seeds a company caller and its campaign with server-derived ownership. */
export async function seedCampaign(t: TestConvex, options: SeedCampaignOptions) {
  const asCompany = await seedUser(t, {
    subject: options.subject,
    org: { id: options.orgId ?? "org_acme", role: options.role },
  });
  const { campaignId, membership } = await asCompany.run(async (ctx) => {
    const { membership } = await companyContext(ctx);
    const campaignId = await createCampaign(ctx, {
      companyId: membership.companyId,
      createdBy: membership._id,
      ...campaignArgs(),
    });
    if (options.status !== undefined) {
      await ctx.db.patch("campaigns", campaignId, { status: options.status });
    }
    return { campaignId, membership };
  });
  return { asCompany, campaignId, membership };
}

/** A company-supplied deliverable. */
export function deliverableArgs(overrides: Partial<DeliverableCreate> = {}): DeliverableCreate {
  return {
    reviewCriteria: [{ id: "product", description: "Mention the product." }],
    title: "Launch video",
    description: "A 30-second vertical video showing the moisturizer in your morning routine.",
    ...overrides,
  };
}

/** A complete opportunity brief, with one deliverable, without server-owned fields. */
export function opportunityArgs(
  campaignId: Id<"campaigns">,
  overrides: Partial<OpportunityCreate> = {},
): OpportunityCreate {
  return {
    campaignId,
    title: "Moisturizer launch video",
    description: "Show the product in your daily skincare routine.",
    status: "open",
    isGated: false,
    usesAiReviewDefault: true,
    maxSlots: 5,
    deadline: Math.ceil((Date.now() + 86_400_000) / 1_800_000) * 1_800_000,
    fixedFeeCents: 10_000,
    cpmRateCents: 500,
    paymentCapCents: 25_000,
    contentRequirements: "One 30-second video",
    reviewPolicy: "Disclose the paid partnership. No medical claims.",
    deliverables: [deliverableArgs()],
    ...overrides,
  };
}

/** The brief as stored on the opportunity; its deliverables are stored as their own rows. */
export function withoutDeliverables(
  args: OpportunityCreate,
): Omit<OpportunityCreate, "deliverables"> {
  const brief: Partial<OpportunityCreate> = { ...args };
  delete brief.deliverables;
  return brief as Omit<OpportunityCreate, "deliverables">;
}

/** Seeds a campaign and an opportunity through the model, bypassing route authorization. */
export async function seedOpportunity(
  t: TestConvex,
  options: SeedCampaignOptions,
  overrides: Partial<OpportunityCreate> = {},
) {
  const owner = await seedCampaign(t, options);
  const opportunityId = await t.run(
    async (ctx) =>
      await createOpportunity(ctx, owner.membership, opportunityArgs(owner.campaignId, overrides)),
  );
  return { ...owner, opportunityId };
}

/**
 * Inserts an assignment directly, in any status, with the seeded opportunity's
 * default terms. Ownership fields are copied from the opportunity.
 */
export async function seedAssignment(
  t: TestConvex,
  fields: Pick<Doc<"assignments">, "opportunityId" | "creatorId"> &
    Partial<Pick<Doc<"assignments">, "status">>,
): Promise<Id<"assignments">> {
  return await t.run(async (ctx) => {
    const opportunity = await ctx.db.get("opportunities", fields.opportunityId);
    if (opportunity === null) throw new Error("expected seeded opportunity");
    return await ctx.db.insert("assignments", {
      companyId: opportunity.companyId,
      campaignId: opportunity.campaignId,
      fixedFeeCents: 10_000,
      cpmRateCents: 500,
      paymentCapCents: 25_000,
      usesAiReview: true,
      status: "termsPending",
      ...fields,
    });
  });
}

export type SeedGatedOpportunityOptions = {
  /** Company member who owns the opportunity. Defaults to a member of `org_acme`. */
  subject?: string;
  orgId?: string;
  /** Applied after creation, so states creation cannot produce (paused, closed) work too. */
  opportunity?: Partial<WithoutSystemFields<Doc<"opportunities">>>;
};

/**
 * Seeds an open, gated opportunity through `seedOpportunity` for application
 * tests, and returns the owning company's ID alongside its other IDs.
 */
export async function seedGatedOpportunity(t: TestConvex, opts: SeedGatedOpportunityOptions = {}) {
  const seeded = await seedOpportunity(
    t,
    { subject: opts.subject ?? "company_owner", orgId: opts.orgId },
    { isGated: true, maxSlots: 10 },
  );
  const patch = opts.opportunity;
  if (patch !== undefined) {
    await t.run(async (ctx) => await ctx.db.patch("opportunities", seeded.opportunityId, patch));
  }
  return { ...seeded, companyId: seeded.membership.companyId };
}

/** Seeds a company user and returns their client and membership row. Defaults to a member. */
export async function seedMembership(
  t: TestConvex,
  subject: string,
  orgId = `org_${subject}`,
  role: Infer<typeof companyRole> = "member",
) {
  const asMember = await seedUser(t, { subject, org: { id: orgId, role } });
  const { membership } = await asMember.run(async (ctx) => await companyContext(ctx));
  return { asMember, membership };
}

export type AssignmentFixture = {
  assignmentId: Id<"assignments">;
  mediaId: Id<"mediaUploads">;
  /** The seeded opportunity's only deliverable. */
  deliverableId: Id<"deliverables">;
  creatorId: Id<"creators">;
  creatorUserId: Id<"users">;
  membership: Doc<"companyUsers">;
  asCreator: ReturnType<TestConvex["withIdentity"]>;
  asCompany: ReturnType<TestConvex["withIdentity"]>;
};

export const submissionDraftFields = {
  draftDescription: "60-second walkthrough: install, `driftwood init`, first deploy at 0:45.",
} satisfies Omit<SubmissionDraft, "assignmentId" | "deliverableId" | "mediaId">;

/** Builds a creator-supplied draft while allowing each test to override its scenario. */
export function submissionArgs(
  fixture: Pick<AssignmentFixture, "assignmentId" | "deliverableId" | "mediaId">,
  overrides: Partial<SubmissionDraft> = {},
): SubmissionDraft {
  const { assignmentId, deliverableId, mediaId } = fixture;
  return { assignmentId, deliverableId, mediaId, ...submissionDraftFields, ...overrides };
}

// Subjects the assignment fixture seeds. Every test gets a fresh database and
// seeds at most one assignment, so fixed names never collide.
const FIXTURE_COMPANY = "fixture-company";
const FIXTURE_CREATOR = "fixture-creator";
const FIXTURE_OPERATOR = "fixture-operator";

/**
 * Seeds a company member and a creator linked by an `active` assignment, through
 * the shared opportunity and assignment helpers.
 */
export async function seedAssignmentFixture(
  t: TestConvex,
  options: Partial<Pick<Doc<"assignments">, "status" | "usesAiReview">> & {
    opportunity?: Partial<OpportunityCreate>;
  } = {},
  companyRoleForFixture: Infer<typeof companyRole> = "member",
): Promise<AssignmentFixture> {
  const { asCompany, membership, opportunityId } = await seedOpportunity(
    t,
    { subject: FIXTURE_COMPANY, orgId: "org_fixture", role: companyRoleForFixture },
    options.opportunity,
  );
  const creatorId = await seedCreatorId(t, FIXTURE_CREATOR);
  const assignmentId = await seedAssignment(t, {
    opportunityId,
    creatorId,
    status: options.status ?? "active",
  });
  const usesAiReview = options.usesAiReview ?? false;
  const { creatorUserId, deliverableId } = await t.run(async (ctx) => {
    await ctx.db.patch("assignments", assignmentId, { usesAiReview });
    const user = await getUserByWorkosId(ctx, FIXTURE_CREATOR);
    if (user === null) throw new Error("expected seeded creator");
    const deliverable = await ctx.db
      .query("deliverables")
      .withIndex("by_opportunityId", (q) => q.eq("opportunityId", opportunityId))
      .first();
    if (deliverable === null) throw new Error("expected seeded deliverable");
    return { creatorUserId: user._id, deliverableId: deliverable._id };
  });

  const mediaId = await seedSubmissionVideo(t, { assignmentId, creatorUserId });
  return {
    mediaId,
    assignmentId,
    deliverableId,
    creatorId,
    creatorUserId,
    membership,
    asCreator: t.withIdentity(workosIdentity({ subject: FIXTURE_CREATOR })),
    asCompany,
  };
}

/** Builds normalized provider output for persistence tests, independently of provider parsing. */
export function aiTranscriptionArgs(
  overrides: Partial<Extract<Transcription, { status: "completed" }>> = {},
): Extract<Transcription, { status: "completed" }> {
  return {
    id: "job-1",
    status: "completed",
    text: "Driftwood.",
    words: [{ text: "Driftwood.", startMs: 0, endMs: 900 }],
    durationSeconds: 1,
    model: "universal-2",
    ...overrides,
  };
}

/** Seeds a completed private video; overrides intentionally model invalid media in authorization tests. */
export async function seedSubmissionVideo(
  t: TestConvex,
  fixture: Pick<AssignmentFixture, "creatorUserId" | "assignmentId">,
  overrides: Partial<WithoutSystemFields<Doc<"mediaUploads">>> = {},
): Promise<Id<"mediaUploads">> {
  return await t.run((ctx) =>
    ctx.db.insert("mediaUploads", {
      ownerUserId: fixture.creatorUserId,
      assignmentId: fixture.assignmentId,
      kind: "video-submission",
      status: "complete",
      contentType: "video/mp4",
      stagingKey: "staging/video-submission/test",
      permanentKey: "media/video-submission/test",
      sizeBytes: 1024,
      grantExpiresAt: Date.now() + 60_000,
      ...overrides,
    }),
  );
}

/** Seeds a media-backed AI draft with confirmed requirements and a ready attempt. */
export async function seedAiReviewFixture(
  t: TestConvex,
  reviewCriteria: NonNullable<DeliverableCreate["reviewCriteria"]> = [
    { id: "product", description: "Mention Driftwood." },
  ],
  draft: Partial<SubmissionDraft> = {},
): Promise<
  AssignmentFixture & {
    mediaId: Id<"mediaUploads">;
    submissionId: Id<"submissions">;
    attempt: Doc<"aiReviewAttempts">;
  }
> {
  const fixture = await seedAssignmentFixture(t, {
    usesAiReview: true,
    opportunity: {
      title: "Driftwood launch demo",
      description: "Demonstrate a first deployment using Driftwood CLI.",
      contentRequirements: "Explain how Driftwood simplifies deployment.",
      reviewPolicy: "Disclose the paid partnership. Do not promise zero downtime.",
      deliverables: [
        deliverableArgs({
          title: "CLI demo",
          description: "Introduce Driftwood and explain a first deployment.",
          reviewCriteria,
        }),
      ],
    },
  });
  const mediaId = fixture.mediaId;
  const submissionId = await t.run((ctx) =>
    createSubmission(ctx, fixture.creatorId, submissionArgs(fixture, draft)),
  );
  const attempt = await t.run((ctx) =>
    ctx.db
      .query("aiReviewAttempts")
      .withIndex("by_submissionId", (q) => q.eq("submissionId", submissionId))
      .unique(),
  );
  if (!attempt) throw new Error("expected seeded AI review attempt");
  return { ...fixture, mediaId, submissionId, attempt };
}

/**
 * Adds another deliverable to the fixture's opportunity. Inserts directly,
 * since the fixture's assignment already locks deliverables against the model.
 */
export async function seedDeliverable(
  t: TestConvex,
  fixture: AssignmentFixture,
): Promise<Id<"deliverables">> {
  return await t.run(async (ctx) => {
    const existing = await ctx.db.get("deliverables", fixture.deliverableId);
    if (existing === null) throw new Error("expected seeded deliverable");
    return await ctx.db.insert("deliverables", {
      opportunityId: existing.opportunityId,
      createdBy: existing.createdBy,
      title: "Follow-up thread",
      description: "Three posts on your results after two weeks.",
    });
  });
}

/** Inserts a submission in the given state, bypassing the create rules. */
export async function seedSubmission(
  t: TestConvex,
  fixture: AssignmentFixture,
  status: Infer<typeof submissionStatus>,
): Promise<Id<"submissions">> {
  return await t.run(async (ctx) => {
    const assignment = await ctx.db.get("assignments", fixture.assignmentId);
    if (assignment === null) throw new Error("expected seeded assignment");
    const draft = {
      assignmentId: fixture.assignmentId,
      deliverableId: fixture.deliverableId,
      mediaId: fixture.mediaId,
      draftDescription: "Screencast: installing the Driftwood CLI and running a first deploy.",
      usesAiReview: assignment.usesAiReview,
    };
    if (status === "pending") {
      return await ctx.db.insert("submissions", { ...draft, status });
    }
    const review = {
      reviewerType: "companyUser" as const,
      reviewedBy: fixture.membership._id,
      reviewedAt: Date.now(),
    };
    if (status === "approved") {
      return await ctx.db.insert("submissions", { ...draft, ...review, status });
    }
    return await ctx.db.insert("submissions", {
      ...draft,
      ...review,
      status,
      reviewNote: "Add #ad to the caption before posting.",
    });
  });
}

/** Seeds an assignment with one submission in the given state. */
export async function seedOneSubmission(
  t: TestConvex,
  status: Infer<typeof submissionStatus> = "pending",
  assignment: Partial<Pick<Doc<"assignments">, "status" | "usesAiReview">> = {},
) {
  const fixture = await seedAssignmentFixture(t, assignment);
  const submissionId = await seedSubmission(t, fixture, status);
  return { fixture, submissionId };
}

/** Seeds a verified post and approved submission for an existing assignment. */
export async function seedPost(t: TestConvex, assignmentId: Id<"assignments">) {
  const { assignment, deliverable, creator } = await t.run(async (ctx) => {
    const assignment = await ctx.db.get("assignments", assignmentId);
    if (assignment === null) throw new Error("expected seeded assignment");
    const deliverable = await ctx.db
      .query("deliverables")
      .withIndex("by_opportunityId", (q) => q.eq("opportunityId", assignment.opportunityId))
      .first();
    if (deliverable === null) throw new Error("expected seeded deliverable");
    const creator = await ctx.db.get("creators", assignment.creatorId);
    if (creator === null) throw new Error("expected seeded creator");
    return { assignment, deliverable, creator };
  });
  const mediaId = await seedSubmissionVideo(t, { assignmentId, creatorUserId: creator.userId });
  return await t.run(async (ctx) => {
    const submissionId = await ctx.db.insert("submissions", {
      ...submissionArgs({ assignmentId, deliverableId: deliverable._id, mediaId }),
      usesAiReview: true,
      status: "approved",
      reviewerType: "ai",
      reviewedAt: Date.now(),
    });
    const xPostId = String(BigInt(`0x${crypto.randomUUID().replaceAll("-", "")}`));
    return await ctx.db.insert("posts", {
      submissionId,
      campaignId: assignment.campaignId,
      url: `https://x.com/creator/status/${xPostId}`,
      xPostId,
      isActive: true,
      isVerified: true,
      postedAt: Date.now(),
    });
  });
}

/** Inserts a payout with a post, copying historical ownership from its assignment. */
export async function seedPayout(
  t: TestConvex,
  assignmentId: Id<"assignments">,
  overrides: Partial<Omit<WithoutSystemFields<Doc<"payouts">>, "assignmentId">> = {},
): Promise<Id<"payouts">> {
  const postId = overrides.postId ?? (await seedPost(t, assignmentId));
  return await t.run(async (ctx) => {
    const assignment = await ctx.db.get("assignments", assignmentId);
    if (assignment === null) throw new Error("expected seeded assignment");
    const reviewRequestedAt = overrides.reviewRequestedAt ?? Date.now();
    return await ctx.db.insert("payouts", {
      assignmentId,
      creatorId: assignment.creatorId,
      companyId: assignment.companyId,
      campaignId: assignment.campaignId,
      postId,
      sourceKey: `test-earning:${crypto.randomUUID()}`,
      amount: 10_000,
      currency: "usd",
      reviewRequestedAt,
      approvalDueAt: reviewRequestedAt + 3 * 86_400_000,
      approvalStatus: "pending",
      paymentStatus: "notStarted",
      ...overrides,
    });
  });
}

type OpenDispute = Extract<Doc<"disputes">, { status: "open" }>;
type DisputeResolutionFields = Omit<
  Extract<Doc<"disputes">, { status: "resolved" }>,
  keyof OpenDispute
>;

/**
 * Inserts a dispute on the fixture's assignment, bypassing the create rules.
 * Defaults to an open dispute raised by the fixture's creator; pass
 * `resolution` to seed it already resolved.
 */
export async function seedDispute(
  t: TestConvex,
  fixture: AssignmentFixture,
  fields: Partial<Omit<WithoutSystemFields<OpenDispute>, "status">> = {},
  resolution?: DisputeResolutionFields,
): Promise<Id<"disputes">> {
  return await t.run(async (ctx) => {
    const assignment = await ctx.db.get("assignments", fixture.assignmentId);
    if (assignment === null) throw new Error("expected seeded assignment");
    const open = {
      assignmentId: assignment._id,
      companyId: assignment.companyId,
      creatorId: assignment.creatorId,
      campaignId: assignment.campaignId,
      openedBy: fixture.creatorUserId,
      openedByRole: "creator" as const,
      reason: "unfairReview" as const,
      description: "The brief allows showing the deploy log, which the review asked me to cut.",
      ...fields,
    };
    return await ctx.db.insert(
      "disputes",
      resolution === undefined
        ? { ...open, status: "open" }
        : { ...open, ...resolution, status: "resolved" },
    );
  });
}

/** Seeds a submission an operator overrode after a dispute, with every reviewer-identity field set. */
export async function seedOverriddenSubmission(t: TestConvex) {
  const fixture = await seedAssignmentFixture(t);
  const operatorId = await seedOperatorId(t, FIXTURE_OPERATOR);
  const disputeId = await seedDispute(
    t,
    fixture,
    {},
    {
      resolvedBy: operatorId,
      resolvedByRole: "operator",
      resolvedAt: Date.now(),
      outcome: "approved",
      note: "The brief allows the deploy log; approved as submitted.",
    },
  );

  const submissionId = await t.run(async (ctx) => {
    const reviewedAt = Date.now();
    return await ctx.db.insert("submissions", {
      assignmentId: fixture.assignmentId,
      deliverableId: fixture.deliverableId,
      mediaId: fixture.mediaId,
      draftDescription: "Screencast: installing the Driftwood CLI and running a first deploy.",
      usesAiReview: false,
      status: "approved",
      reviewerType: "operator",
      reviewedByOperator: operatorId,
      reviewedAt,
      overriddenReview: {
        status: "changesRequested",
        reviewNote: "Cut the deploy log at 0:40.",
        reviewerType: "companyUser",
        reviewedBy: fixture.membership._id,
        reviewedAt: reviewedAt - 60_000,
      },
      disputeId,
    });
  });
  return { fixture, submissionId };
}

/**
 * A full view minus reviewer identity. Deletes fields rather than copying them,
 * so it cross-checks the model's field-by-field copy.
 */
export function withoutReviewerIdentity(view: object): object {
  const copy: Record<string, unknown> = { ...view };
  delete copy.reviewedBy;
  delete copy.reviewedByOperator;
  if (copy.overriddenReview !== undefined) {
    const overriddenReview = { ...(copy.overriddenReview as Record<string, unknown>) };
    delete overriddenReview.reviewedBy;
    copy.overriddenReview = overriddenReview;
  }
  return copy;
}

/** A notification as the recipient sees it, without IDs or timestamps. */
export type ReceivedNotification = Pick<Doc<"notifications">, "type" | "title" | "body" | "target">;

/** Reads the notifications sent to one user, oldest first. */
export async function notificationsForUser(t: TestConvex, userId: Id<"users">) {
  return await t.run(async (ctx) => {
    const rows = await ctx.db
      .query("notifications")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .take(20);
    return rows.map(({ type, title, body, target }): ReceivedNotification => ({
      type,
      title,
      body,
      target,
    }));
  });
}

/** Reads the notifications sent to a creator, oldest first. */
export async function creatorNotifications(t: TestConvex, creatorId: Id<"creators">) {
  const creator = await t.run(async (ctx) => await ctx.db.get("creators", creatorId));
  if (creator === null) throw new Error("expected seeded creator");
  return await notificationsForUser(t, creator.userId);
}

/** Reads the notifications sent to a company member, oldest first. */
export async function memberNotifications(t: TestConvex, membership: Doc<"companyUsers">) {
  return await notificationsForUser(t, membership.userId);
}

/** Reads one submission as stored, or `null` if it doesn't exist. */
export async function storedSubmission(t: TestConvex, submissionId: Id<"submissions">) {
  return await t.run(async (ctx) => await ctx.db.get("submissions", submissionId));
}

/** Builds an independent full-view expectation from stored data, not the production projection. */
export async function expectedSubmissionView(
  t: TestConvex,
  submissionId: Id<"submissions">,
  closed = false,
) {
  const stored = await storedSubmission(t, submissionId);
  if (stored === null) throw new Error("expected a stored submission");
  return { ...stored, closedWithoutReview: closed };
}

/** Reads every submission in the test's database, oldest first. */
export async function storedSubmissions(t: TestConvex) {
  return await t.run(async (ctx) => await ctx.db.query("submissions").collect());
}

/** Reads every dispute in the test's database, oldest first. */
export async function storedDisputes(t: TestConvex) {
  return await t.run(async (ctx) => await ctx.db.query("disputes").collect());
}

/** Builds normalized review evidence independently of provider response parsing. */
export function aiReviewResultArgs(
  overrides: Partial<Infer<typeof aiReviewResult>> = {},
): Infer<typeof aiReviewResult> {
  return {
    model: "jev-1.14.0",
    inputTokens: 200,
    outputTokens: 0,
    results: [
      {
        criterionId: "product",
        outcome: "met",
        confidence: 0.9,
        probabilities: { met: 0.95, not_met: 0.03, uncertain: 0.02 },
      },
    ],
    ...overrides,
  };
}

/** Moves an existing fixture through the normal model operations to evaluation. */
export async function prepareAiReviewEvaluation(
  t: TestConvex,
  attemptId: Id<"aiReviewAttempts">,
): Promise<void> {
  await t.run(async (ctx) => {
    await claimAiReviewAttempt(ctx, attemptId);
    await recordAiTranscriptionJob(ctx, attemptId, "job-1");
    await saveAiTranscription(ctx, attemptId, aiTranscriptionArgs());
  });
}

export const DAY = 86_400_000;
export const EARNINGS_TEST_START = Date.UTC(2026, 10, 11, 12);

/** Real verification creates the agreement and schedule; metric evidence is supplied explicitly. */
export async function seedScheduledEarnings(
  t: TestConvex,
  terms: { fixedFeeCents?: number; cpmRateCents?: number; paymentCapCents?: number } = {},
) {
  const fixture = await seedAssignmentFixture(t);
  const startedAt = Date.now();
  await t.run((ctx) =>
    ctx.db.patch("assignments", fixture.assignmentId, {
      fixedFeeCents: 10_000,
      cpmRateCents: 10_000,
      paymentCapCents: 20_000,
      ...terms,
    }),
  );
  const submissionId = await seedSubmission(t, fixture, "approved");
  const xPostId = BigInt(`0x${crypto.randomUUID().replaceAll("-", "")}`)
    .toString()
    .slice(0, 20);
  const postId = await t.run(async (ctx) => {
    const id = await createPost(ctx, fixture.creatorId, {
      submissionId,
      url: `https://x.com/creator/status/${xPostId}`,
    });
    await verifyPost(ctx, id, { postedAt: startedAt - 1000 });
    return id;
  });
  const { earningsId, scheduleId } = await t.run(async (ctx) => {
    const earnings = (await ctx.db
      .query("deliverableEarnings")
      .withIndex("by_assignmentId_and_deliverableId", (q) =>
        q.eq("assignmentId", fixture.assignmentId).eq("deliverableId", fixture.deliverableId),
      )
      .unique())!;
    const schedule = (await ctx.db
      .query("earningsSchedules")
      .withIndex("by_earningsId", (q) => q.eq("earningsId", earnings._id))
      .unique())!;
    return { earningsId: earnings._id, scheduleId: schedule._id };
  });
  const snapshot = (day: number, views: number) =>
    t.run((ctx) =>
      recordPostViewSnapshot(ctx, {
        postId,
        observedAt: startedAt + day * DAY,
        views,
        sourceKey: `test:day:${day}`,
      }),
    );
  return { ...fixture, postId, earningsId, scheduleId, startedAt, snapshot };
}
