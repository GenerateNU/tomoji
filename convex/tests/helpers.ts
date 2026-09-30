import type { convexTest } from "convex-test";
import type { UserIdentity } from "convex/server";
import type { Infer } from "convex/values";
import { expect } from "vitest";
import type { Doc, Id } from "../_generated/dataModel";
import type { ApiErrorCode } from "../lib/errors";
import { companyContext } from "../lib/functions";
import { getCreatorByUserId } from "../models/creators";
import { applyMembership, getUserByWorkosId, upsertUser } from "../models/users";
import type { companyRole } from "../schemas/companyUsers.schema";
import type { submissionStatus } from "../schemas/submissions.schema";

export type TestConvex = ReturnType<typeof convexTest>;

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

/**
 * Seeds a company member and a creator, linked by an assignment through a
 * campaign and opportunity. `prefix` keeps subjects and orgs unique per test.
 *
 * The rows are inserted directly because the assignments and opportunities
 * domains have no model functions yet.
 */
export async function seedAssignment(
  t: TestConvex,
  prefix: string,
  assignment: Partial<Pick<Doc<"assignments">, "status" | "usesAiReview">> = {},
): Promise<AssignmentFixture> {
  const companySubject = `${prefix}-company`;
  const creatorSubject = `${prefix}-creator`;

  const { asMember: asCompany, membership } = await seedMembership(
    t,
    companySubject,
    `org_${prefix}`,
  );
  const creatorId = await seedCreatorId(t, creatorSubject);

  const assignmentId = await t.run(async (ctx) => {
    const campaignId = await ctx.db.insert("campaigns", {
      companyId: membership.companyId,
      createdBy: membership._id,
      title: "Spring launch",
      objective: "Introduce the new skincare range",
      product: "Daily moisturizer",
      audience: "Gen Z skincare enthusiasts",
      description: "Campaign supporting the spring launch.",
      status: "open",
      budgetCents: 250_000,
      startsAt: Date.now(),
    });
    const opportunityId = await ctx.db.insert("opportunities", {
      campaignId,
      createdBy: membership._id,
      title: "Unboxing video",
      description: "A 30-second unboxing of the moisturizer.",
      isGated: false,
      usesAiReviewDefault: false,
      targetApplicant: "Skincare creators",
      maxSlots: 5,
      numFilledSlots: 1,
      maxApplications: 50,
      deadline: Date.now() + 7 * 24 * 60 * 60 * 1000,
      status: "open",
      fixedFeeCents: 10_000,
      cpmRateCents: 500,
      paymentCapCents: 50_000,
      contentRequirements: "Show the product within the first 5 seconds.",
      prohibitedClaims: "No medical claims.",
      disclosureRequirements: "Include #ad.",
      usageRights: "Organic use for 90 days.",
    });
    return await ctx.db.insert("assignments", {
      opportunityId,
      creatorId,
      fixedFeeCents: 10_000,
      cpmRateCents: 500,
      paymentCapCents: 50_000,
      usesAiReview: false,
      status: "active",
      ...assignment,
    });
  });

  return {
    assignmentId,
    creatorId,
    membership,
    asCreator: t.withIdentity(workosIdentity({ subject: creatorSubject })),
    asCompany,
  };
}

/**
 * Inserts a submission in a given state on a fixture's assignment, bypassing
 * the create rules. Like a real draft, it copies `usesAiReview` from the
 * assignment. Reviewed submissions are attributed to the fixture's company member.
 */
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
      draftUrl: "https://drive.example.com/drafts/seeded",
      draftDescription: "Seeded draft",
      usesAiReview: assignment.usesAiReview,
    };
    if (status === "pending") {
      return await ctx.db.insert("submissions", { ...draft, status });
    }
    return await ctx.db.insert("submissions", {
      ...draft,
      status,
      reviewNote: status === "changesRequested" ? "Add the #ad disclosure." : undefined,
      reviewerType: "companyUser",
      reviewedBy: fixture.membership._id,
      reviewedAt: Date.now(),
    });
  });
}

// `TestConvex` loses the schema types, so rows read through `t.run` come back
// untyped. These two helpers hold the only casts back to the submission type.

/** Reads one submission as stored, or `null` if it doesn't exist. */
export async function storedSubmission(
  t: TestConvex,
  submissionId: Id<"submissions">,
): Promise<Doc<"submissions"> | null> {
  return (await t.run(
    async (ctx) => await ctx.db.get("submissions", submissionId),
  )) as Doc<"submissions"> | null;
}

/**
 * Reads every submission in the test's database, oldest first. Each test has
 * its own database, so with one assignment these are all that assignment's.
 */
export async function storedSubmissions(t: TestConvex): Promise<Doc<"submissions">[]> {
  return (await t.run(
    async (ctx) => await ctx.db.query("submissions").collect(),
  )) as Doc<"submissions">[];
}
