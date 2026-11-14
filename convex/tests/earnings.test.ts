/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../_generated/api";
import { createPost, verifyPost } from "../models/posts";
import schema from "../schema";
import {
  DAY,
  EARNINGS_TEST_START as START,
  expectApiError,
  seedAssignmentFixture,
  seedOperator,
  seedScheduledEarnings,
  seedSubmission,
  seedUser,
  seedWrongOrgCaller,
  workosIdentity,
  type TestConvex,
} from "./helpers";

const modules = import.meta.glob("../**/*.ts");
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(START);
});
afterEach(() => vi.useRealTimers());

test("authorized earnings reads expose verified terms and a linked settlement", async () => {
  const t = convexTest(schema, modules);
  const fixture = await seedScheduledEarnings(t, { cpmRateCents: 0 });
  const args = { assignmentId: fixture.assignmentId, deliverableId: fixture.deliverableId };
  vi.setSystemTime(START + 7 * DAY);
  const settled = await t.mutation(internal.earnings.settle, { ...args, periodIndex: 0 });
  const details = await fixture.asCreator.query(api.earnings.get, args);
  expect(details).toMatchObject({
    _id: fixture.earningsId,
    ...args,
    postId: fixture.postId,
    creatorId: fixture.creatorId,
    fixedFeeCents: 10_000,
    cpmRateCents: 0,
    paymentCapCents: 20_000,
    currency: "usd",
    startedAt: START,
    endsAt: START + 30 * DAY,
    window: { status: "known", effectiveEndsAt: START + 30 * DAY },
    schedule: { status: "scheduled", nextCheckAt: START + 7 * DAY },
  });
  const history = await fixture.asCreator.query(api.earnings.listCalculations, {
    ...args,
    paginationOpts: { numItems: 10, cursor: null },
  });
  expect(history.isDone).toBe(true);
  expect(history.page).toMatchObject([
    {
      _id: settled.calculationIds[0],
      earningsId: fixture.earningsId,
      status: "recorded",
      periodIndex: 0,
      newFixedCents: 10_000,
      newVariableCents: 0,
      newPayoutCents: 10_000,
      payoutId: settled.payoutIds[0],
    },
  ]);
  expect(history.page[0]).not.toHaveProperty("sourceKey");
  expect(history.page[0]).not.toHaveProperty("previouslyRecordedEarningsCents");
});

test.each(["creator", "member", "admin", "operator"] as const)(
  "allows an authorized %s to read earnings details and calculation history",
  async (role) => {
    const t = convexTest(schema, modules);
    const fixture = await seedScheduledEarnings(t);
    if (role === "admin") {
      await t.run((ctx) => ctx.db.patch("companyUsers", fixture.membership._id, { role: "admin" }));
    }
    const caller =
      role === "operator"
        ? await seedOperator(t, "operator")
        : role === "creator"
          ? fixture.asCreator
          : fixture.asCompany;
    const args = { assignmentId: fixture.assignmentId, deliverableId: fixture.deliverableId };
    expect(await caller.query(api.earnings.get, args)).toHaveProperty("_id", fixture.earningsId);
    const history = await caller.query(api.earnings.listCalculations, {
      ...args,
      paginationOpts: { numItems: 1, cursor: null },
    });
    expect(history.page).toEqual([]);
    expect(history.isDone).toBe(true);
  },
);

describe.each(["get", "listCalculations"] as const)("earnings.%s authorization", (route) => {
  type Scope = Pick<
    Awaited<ReturnType<typeof seedScheduledEarnings>>,
    "assignmentId" | "deliverableId"
  >;
  const read = (caller: Pick<TestConvex, "query">, args: Scope) =>
    route === "get"
      ? caller.query(api.earnings.get, args)
      : caller.query(api.earnings.listCalculations, {
          ...args,
          paginationOpts: { numItems: 10, cursor: null },
        });

  test.each([
    "signed-out",
    "unsynced",
    "wrong-org",
    "inactive-creator",
    "inactive-company",
    "revoked-member",
  ] as const)("rejects a %s caller", async (kind) => {
    const t = convexTest(schema, modules);
    const fixture = await seedScheduledEarnings(t);
    let caller: Pick<TestConvex, "query"> = fixture.asCompany;
    if (kind === "signed-out") caller = t;
    else if (kind === "unsynced") caller = t.withIdentity(workosIdentity({ subject: "unsynced" }));
    else if (kind === "wrong-org") caller = await seedWrongOrgCaller(t);
    else if (kind === "revoked-member") {
      await t.run((ctx) =>
        ctx.db.patch("companyUsers", fixture.membership._id, { isActive: false }),
      );
    } else {
      const creator = kind === "inactive-creator";
      caller = creator ? fixture.asCreator : fixture.asCompany;
      await t.run((ctx) =>
        ctx.db.patch("users", creator ? fixture.creatorUserId : fixture.membership.userId, {
          isActive: false,
        }),
      );
    }
    const code =
      kind === "signed-out"
        ? "not_authenticated"
        : kind === "unsynced"
          ? "not_synced"
          : kind.startsWith("inactive")
            ? "account_deactivated"
            : "forbidden";
    await expectApiError(
      () =>
        read(caller, {
          assignmentId: fixture.assignmentId,
          deliverableId: fixture.deliverableId,
        }),
      code,
    );
  });

  test.each(["creator", "company"] as const)(
    "hides a foreign agreement from an unrelated %s like a missing agreement",
    async (role) => {
      const t = convexTest(schema, modules);
      const fixture = await seedScheduledEarnings(t);
      const outsider = await seedUser(t, {
        subject: "outsider",
        ...(role === "company" ? { org: { id: "org_outside", role: "admin" as const } } : {}),
      });
      const args = { assignmentId: fixture.assignmentId, deliverableId: fixture.deliverableId };
      await expect(read(outsider, args)).rejects.toMatchObject({
        data: { code: "not_found", resource: "deliverable_earnings" },
      });
      await t.run((ctx) => ctx.db.delete("deliverableEarnings", fixture.earningsId));
      for (const caller of [fixture.asCreator, outsider]) {
        await expect(read(caller, args)).rejects.toMatchObject({
          data: { code: "not_found", resource: "deliverable_earnings" },
        });
      }
    },
  );

  test("does not combine an assignment with another agreement's deliverable", async () => {
    const t = convexTest(schema, modules);
    const first = await seedScheduledEarnings(t);
    const second = await seedScheduledEarnings(t);
    await expect(
      read(first.asCreator, {
        assignmentId: first.assignmentId,
        deliverableId: second.deliverableId,
      }),
    ).rejects.toMatchObject({ data: { code: "not_found", resource: "deliverable_earnings" } });
  });

  test.each(["creatorId", "companyId"] as const)(
    "rejects a supplied %s ownership override",
    async (field) => {
      const t = convexTest(schema, modules);
      const fixture = await seedScheduledEarnings(t);
      const args = {
        assignmentId: fixture.assignmentId,
        deliverableId: fixture.deliverableId,
        [field]: field === "creatorId" ? fixture.creatorId : fixture.membership.companyId,
      };
      await expect(read(fixture.asCreator, args)).rejects.toThrow(`Unexpected field \`${field}\``);
    },
  );
});

test("the financial settlement operation is internal and accepts no caller-supplied amount", async () => {
  const { settle } = await import("../earnings");
  // convex-test can call internal functions; registration is the public API boundary.
  expect(settle).toHaveProperty("isInternal", true);
  expect(settle).not.toHaveProperty("isPublic");
  const t = convexTest(schema, modules);
  const fixture = await seedAssignmentFixture(t);
  const untrustedInput = {
    assignmentId: fixture.assignmentId,
    deliverableId: fixture.deliverableId,
    periodIndex: 0,
    amount: 999_999,
  };
  await expect(t.mutation(internal.earnings.settle, untrustedInput)).rejects.toThrow();
  expect(await t.run(async (ctx) => await ctx.db.query("payouts").collect())).toHaveLength(0);
});

test("the route validates and returns a real settlement from lifecycle-created state", async () => {
  const t = convexTest(schema, modules);
  vi.useFakeTimers({ toFake: ["Date"] });
  const startedAt = 1_800_000_000_000;
  vi.setSystemTime(startedAt);
  const fixture = await seedAssignmentFixture(t);
  const submissionId = await seedSubmission(t, fixture, "approved");
  await t.run(async (ctx) => {
    await ctx.db.patch("assignments", fixture.assignmentId, {
      fixedFeeCents: 10_000,
      cpmRateCents: 0,
      paymentCapCents: 20_000,
    });
    const postId = await createPost(ctx, fixture.creatorId, {
      submissionId,
      url: "https://x.com/creator/status/123",
    });
    await verifyPost(ctx, postId, { postedAt: startedAt - 1000 });
  });
  vi.setSystemTime(startedAt + 7 * 86_400_000);
  const result = await t.mutation(internal.earnings.settle, {
    assignmentId: fixture.assignmentId,
    deliverableId: fixture.deliverableId,
    periodIndex: 0,
  });
  expect(result.status).toBe("recorded");
  expect(result.calculationIds).toHaveLength(1);
  expect(result.payoutIds).toHaveLength(1);
  expect(
    await t.run(async (ctx) => await ctx.db.get("payouts", result.payoutIds[0])),
  ).toMatchObject({ amount: 10_000, approvalStatus: "pending" });
});
