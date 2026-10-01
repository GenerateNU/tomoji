import type { TestConvex as ConvexTest } from "convex-test";
import type { UserIdentity, WithoutSystemFields } from "convex/server";
import type { Infer } from "convex/values";
import { expect } from "vitest";
import type { Doc, Id } from "../_generated/dataModel";
import type { ApiErrorCode } from "../lib/errors";
import { companyContext } from "../lib/functions";
import { getCreatorByUserId } from "../models/creators";
import { createCampaign } from "../models/campaigns";
import { createOpportunity, type OpportunityCreate } from "../models/opportunities";
import { applyMembership, getUserByWorkosId, upsertUser } from "../models/users";
import type { companyRole } from "../schemas/companyUsers.schema";
import type schema from "../schema";
import type { submissionStatus } from "../schemas/submissions.schema";

export type TestConvex = ConvexTest<typeof schema>;

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

/** Asserts a call fails with a specific API error code. */
export async function expectApiError(call: () => Promise<unknown>, code: ApiErrorCode) {
  await expect(call()).rejects.toThrow(new RegExp(`"code":"${code}"`));
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
      title: "Spring launch",
      objective: "Introduce the new skincare range",
      product: "Daily moisturizer",
      audience: "Skincare enthusiasts",
      description: "Campaign supporting the spring launch.",
      status: "open",
      budgetCents: 250_000,
      startsAt: Date.now(),
    });
    if (options.status !== undefined) {
      await ctx.db.patch("campaigns", campaignId, { status: options.status });
    }
    return { campaignId, membership };
  });
  return { asCompany, campaignId, membership };
}

/** A complete opportunity brief without server-owned fields. */
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
    targetApplicant: "Skincare creators",
    maxSlots: 5,
    maxApplications: 5,
    deadline: Math.ceil((Date.now() + 86_400_000) / 1_800_000) * 1_800_000,
    fixedFeeCents: 10_000,
    cpmRateCents: 500,
    paymentCapCents: 25_000,
    contentRequirements: "One 30-second video",
    prohibitedClaims: "No medical claims",
    disclosureRequirements: "Disclose the paid partnership",
    usageRights: "Organic reposting for 30 days",
    ...overrides,
  };
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
    { isGated: true, maxSlots: 10, maxApplications: 10 },
  );
  const patch = opts.opportunity;
  if (patch !== undefined) {
    await t.run(async (ctx) => await ctx.db.patch("opportunities", seeded.opportunityId, patch));
  }
  return { ...seeded, companyId: seeded.membership.companyId };
}

/** Seeds a company member and returns their client and membership row. */
export async function seedMembership(t: TestConvex, subject: string, orgId = `org_${subject}`) {
  const asMember = await seedUser(t, { subject, org: { id: orgId } });
  const { membership } = await asMember.run(async (ctx) => await companyContext(ctx));
  return { asMember, membership };
}

export type AssignmentFixture = {
  assignmentId: Id<"assignments">;
  creatorId: Id<"creators">;
  membership: Doc<"companyUsers">;
  asCreator: ReturnType<TestConvex["withIdentity"]>;
  asCompany: ReturnType<TestConvex["withIdentity"]>;
};

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
  assignment: Partial<Pick<Doc<"assignments">, "status" | "usesAiReview">> = {},
): Promise<AssignmentFixture> {
  const { asCompany, membership, opportunityId } = await seedOpportunity(t, {
    subject: FIXTURE_COMPANY,
    orgId: "org_fixture",
  });
  const creatorId = await seedCreatorId(t, FIXTURE_CREATOR);
  const assignmentId = await seedAssignment(t, {
    opportunityId,
    creatorId,
    status: assignment.status ?? "active",
  });
  const usesAiReview = assignment.usesAiReview ?? false;
  await t.run(async (ctx) => await ctx.db.patch("assignments", assignmentId, { usesAiReview }));

  return {
    assignmentId,
    creatorId,
    membership,
    asCreator: t.withIdentity(workosIdentity({ subject: FIXTURE_CREATOR })),
    asCompany,
  };
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
      draftUrl: "https://drive.example.com/drafts/driftwood-cli-screencast",
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

/** Seeds a submission an operator overrode after a dispute, with every reviewer-identity field set. */
export async function seedOverriddenSubmission(t: TestConvex) {
  const fixture = await seedAssignmentFixture(t);
  await seedOperator(t, FIXTURE_OPERATOR);

  const submissionId = await t.run(async (ctx) => {
    const operator = await getUserByWorkosId(ctx, FIXTURE_OPERATOR);
    const creator = await ctx.db.get("creators", fixture.creatorId);
    if (operator === null || creator === null) throw new Error("expected seeded users");
    const reviewedAt = Date.now();
    const disputeId = await ctx.db.insert("disputes", {
      assignmentId: fixture.assignmentId,
      openedBy: creator.userId,
      reason: "Review contradicts the brief",
      description: "The brief allows showing the deploy log, which the review asked me to cut.",
      isResolved: true,
      resolvedBy: operator._id,
      resolution: "The brief allows the deploy log; approved as submitted.",
    });
    return await ctx.db.insert("submissions", {
      assignmentId: fixture.assignmentId,
      draftUrl: "https://drive.example.com/drafts/driftwood-cli-screencast",
      draftDescription: "Screencast: installing the Driftwood CLI and running a first deploy.",
      usesAiReview: false,
      status: "approved",
      reviewerType: "operator",
      reviewedByOperator: operator._id,
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

/** Reads one submission as stored, or `null` if it doesn't exist. */
export async function storedSubmission(t: TestConvex, submissionId: Id<"submissions">) {
  return await t.run(async (ctx) => await ctx.db.get("submissions", submissionId));
}

/** Reads every submission in the test's database, oldest first. */
export async function storedSubmissions(t: TestConvex) {
  return await t.run(async (ctx) => await ctx.db.query("submissions").collect());
}
