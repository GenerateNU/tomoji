/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import type { FunctionArgs } from "convex/server";
import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import schema from "../schema";
import {
  expectApiError,
  seedAssignmentFixture,
  seedDispute,
  seedMembership,
  seedOperator,
  seedSubmission,
  seedWrongOrgCaller,
  storedDisputes,
  storedSubmission,
  storedSubmissions,
  type AssignmentFixture,
  type TestConvex,
} from "./helpers";

const modules = import.meta.glob("../**/*.ts");

type CreateArgs = FunctionArgs<typeof api.disputes.create>;

function createArgs(fixture: AssignmentFixture, reason: CreateArgs["reason"]): CreateArgs {
  return {
    assignmentId: fixture.assignmentId,
    reason,
    description: "The video went live on Oct 1 and the fixed fee hasn't arrived.",
  };
}

const openList = { status: "open", paginationOpts: { numItems: 10, cursor: null } } as const;

type Client = Pick<TestConvex, "mutation" | "query">;
type Caller = (t: TestConvex, fixture: AssignmentFixture) => Promise<Client>;

const openers: [string, Caller, "creator" | "company" | "operator", CreateArgs["reason"]][] = [
  ["the creator", async (_t, fixture) => fixture.asCreator, "creator", "paymentNotReceived"],
  ["the company user", async (_t, fixture) => fixture.asCompany, "company", "missingDisclosure"],
  ["an operator", async (t) => await seedOperator(t, "dc-operator"), "operator", "payoutAmount"],
];

describe("disputes.create", () => {
  test.each(openers)("lets %s open a dispute", async (_who, caller, role, reason) => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const client = await caller(t, fixture);

    const disputeId = await client.mutation(api.disputes.create, createArgs(fixture, reason));

    expect(await storedDisputes(t)).toMatchObject([{ _id: disputeId, openedByRole: role }]);
  });

  test("refuses a signed-out caller", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);

    await expectApiError(
      () => t.mutation(api.disputes.create, createArgs(fixture, "other")),
      "not_authenticated",
    );
  });

  test("conceals another company's assignment without writing", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const { asMember } = await seedMembership(t, "outsider");

    await expectApiError(
      () => asMember.mutation(api.disputes.create, createArgs(fixture, "missingDisclosure")),
      "not_found",
    );
    expect(await storedDisputes(t)).toEqual([]);
  });

  test("refuses a company user whose token names an org they don't belong to", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const asWrongOrg = await seedWrongOrgCaller(t);

    await expectApiError(
      () => asWrongOrg.mutation(api.disputes.create, createArgs(fixture, "missingDisclosure")),
      "forbidden",
    );
  });
});

describe("disputes.get", () => {
  test("hides who opened it from the creator, not from the company", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const disputeId = await seedDispute(t, fixture, {
      openedBy: fixture.membership.userId,
      openedByRole: "company",
      reason: "missingDisclosure",
    });

    const creatorView = await fixture.asCreator.query(api.disputes.get, { disputeId });
    const companyView = await fixture.asCompany.query(api.disputes.get, { disputeId });

    expect(creatorView).not.toHaveProperty("openedBy");
    expect(creatorView.openedByRole).toBe("company");
    expect(companyView.openedBy).toBe(fixture.membership.userId);
  });

  test("conceals another company's dispute", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const disputeId = await seedDispute(t, fixture);
    const { asMember } = await seedMembership(t, "outsider");

    await expectApiError(() => asMember.query(api.disputes.get, { disputeId }), "not_found");
  });
});

describe("disputes.list", () => {
  test("lists the caller's disputes and returns what get returns", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const disputeId = await seedDispute(t, fixture);
    const asOperator = await seedOperator(t, "dl-operator");

    for (const client of [fixture.asCreator, fixture.asCompany, asOperator]) {
      const { page } = await client.query(api.disputes.list, openList);
      expect(page).toEqual([await client.query(api.disputes.get, { disputeId })]);
    }
  });

  test("shows another company nothing", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    await seedDispute(t, fixture);
    const { asMember } = await seedMembership(t, "outsider");

    const { page } = await asMember.query(api.disputes.list, openList);

    expect(page).toEqual([]);
  });

  test("refuses a company user whose token names an org they don't belong to", async () => {
    const t = convexTest(schema, modules);
    const asWrongOrg = await seedWrongOrgCaller(t);

    await expectApiError(() => asWrongOrg.query(api.disputes.list, openList), "forbidden");
  });
});

describe("disputes.resolve", () => {
  const result = { outcome: "approved", note: "Paid over email." } as const;

  test("lets the opener close it, and both sides see the result", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const disputeId = await seedDispute(t, fixture);

    const view = await fixture.asCreator.mutation(api.disputes.resolve, { disputeId, ...result });

    expect(view).toMatchObject({ status: "resolved", resolvedByRole: "creator", ...result });
    expect(view).not.toHaveProperty("resolvedBy");
    expect(await fixture.asCompany.query(api.disputes.get, { disputeId })).toMatchObject({
      status: "resolved",
      resolvedBy: fixture.creatorUserId,
      ...result,
    });
  });

  test("lets an operator close it directly", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const disputeId = await seedDispute(t, fixture);
    const asOperator = await seedOperator(t, "dr-operator");

    await asOperator.mutation(api.disputes.resolve, { disputeId, outcome: "denied" });

    expect((await storedDisputes(t))[0]).toMatchObject({
      resolvedByRole: "operator",
      outcome: "denied",
    });
  });

  test.each([
    ["a signed-out caller", async (t: TestConvex) => t, "not_authenticated"],
    ["the other side", async (_t: TestConvex, f: AssignmentFixture) => f.asCompany, "forbidden"],
  ] as const)("refuses %s without changing it", async (_who, caller, code) => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const disputeId = await seedDispute(t, fixture);
    const client = await caller(t, fixture);

    await expectApiError(
      () => client.mutation(api.disputes.resolve, { disputeId, ...result }),
      code,
    );
    expect((await storedDisputes(t))[0].status).toBe("open");
  });
});

describe("disputes.override", () => {
  const ruling = { outcome: "denied", note: "The brief required the disclosure." } as const;

  /** Seeds a dispute the creator already closed as approved. */
  async function seedClosedByCreator(t: TestConvex, fixture: AssignmentFixture) {
    return await seedDispute(
      t,
      fixture,
      {},
      {
        resolvedBy: fixture.creatorUserId,
        resolvedByRole: "creator",
        resolvedAt: Date.now(),
        outcome: "approved",
      },
    );
  }

  test("lets an operator override the opener's result", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const disputeId = await seedClosedByCreator(t, fixture);
    const asOperator = await seedOperator(t, "do-operator");

    const overridden = await asOperator.mutation(api.disputes.override, { disputeId, ...ruling });

    expect(await storedDisputes(t)).toEqual([overridden]);
    expect(overridden).toMatchObject({
      resolvedByRole: "operator",
      ...ruling,
      overriddenResolution: { resolvedByRole: "creator", outcome: "approved" },
    });
  });

  test.each([
    ["the creator", (f: AssignmentFixture) => f.asCreator],
    ["the company user", (f: AssignmentFixture) => f.asCompany],
  ] as const)("refuses %s without changing it", async (_who, caller) => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const disputeId = await seedClosedByCreator(t, fixture);
    const before = await storedDisputes(t);

    await expectApiError(
      () => caller(fixture).mutation(api.disputes.override, { disputeId, ...ruling }),
      "forbidden",
    );
    expect(await storedDisputes(t)).toEqual(before);
  });
});

describe("dispute effects through the routes", () => {
  test("lets an operator approve the disputed draft when resolving", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const submissionId = await seedSubmission(t, fixture, "changesRequested");
    const disputeId = await seedDispute(t, fixture);
    const asOperator = await seedOperator(t, "de-operator");

    const view = await asOperator.mutation(api.disputes.resolve, {
      disputeId,
      outcome: "approved",
      effect: { kind: "approveDraft", submissionId },
    });

    expect(view).toMatchObject({ effect: { kind: "approveDraft", submissionId } });
    expect(await storedSubmission(t, submissionId)).toMatchObject({
      status: "approved",
      reviewerType: "operator",
    });
  });

  test("lets an operator cancel the assignment when overriding", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const disputeId = await seedDispute(
      t,
      fixture,
      { reason: "productMisuse", openedBy: fixture.membership.userId, openedByRole: "company" },
      {
        resolvedBy: fixture.membership.userId,
        resolvedByRole: "company",
        resolvedAt: Date.now(),
        outcome: "denied",
      },
    );
    const asOperator = await seedOperator(t, "de-operator");

    const overridden = await asOperator.mutation(api.disputes.override, {
      disputeId,
      outcome: "approved",
      note: "The video shows the product used against the brief.",
      effect: { kind: "cancelAssignment" },
    });

    expect(overridden.effect).toEqual({ kind: "cancelAssignment" });
    const assignment = await t.run(
      async (ctx) => await ctx.db.get("assignments", fixture.assignmentId),
    );
    expect(assignment?.status).toBe("cancelled");
  });

  test("refuses an effect from the opener's side without changing anything", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const submissionId = await seedSubmission(t, fixture, "changesRequested");
    // The creator opened it, so they may close it, just not with an effect.
    const disputeId = await seedDispute(t, fixture);
    const before = { disputes: await storedDisputes(t), submissions: await storedSubmissions(t) };

    await expect(
      fixture.asCreator.mutation(api.disputes.resolve, {
        disputeId,
        outcome: "approved",
        effect: { kind: "approveDraft", submissionId },
      }),
    ).rejects.toMatchObject({ data: { code: "forbidden", reason: "effect_operator_only" } });
    expect({ disputes: await storedDisputes(t), submissions: await storedSubmissions(t) }).toEqual(
      before,
    );
  });
});
