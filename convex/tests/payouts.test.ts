/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "../_generated/api";
import schema from "../schema";
import {
  expectApiError,
  seedAssignmentFixture,
  seedOperator,
  seedPayout,
  seedSubmission,
  seedUser,
  seedWrongOrgCaller,
  workosIdentity,
  type TestConvex,
} from "./helpers";

const modules = import.meta.glob("../**/*.ts");
const firstPage = { numItems: 10, cursor: null };

describe("internal payouts.create", () => {
  test("is registered as an internal mutation", async () => {
    // convex-test can invoke internal functions, so calling it as a test user
    // would not prove the function is unavailable to public clients.
    const { create } = await import("../payouts");
    expect(create).toHaveProperty("isInternal", true);
    expect(create).not.toHaveProperty("isPublic");
  });

  test("records finalized earnings and starts the three-day company review window", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const before = Date.now();

    const payout = await t.mutation(internal.payouts.create, {
      assignmentId: fixture.assignmentId,
      sourceKey: "fixed-fee:published",
      amountCents: 12_345,
      currency: "usd",
    });

    expect(payout).toMatchObject({
      assignmentId: fixture.assignmentId,
      creatorId: fixture.creatorId,
      companyId: fixture.membership.companyId,
      sourceKey: "fixed-fee:published",
      amountCents: 12_345,
      currency: "usd",
      approvalStatus: "pending",
      paymentStatus: "notStarted",
    });
    expect(payout.reviewRequestedAt).toBeGreaterThanOrEqual(before);
    expect(payout.reviewRequestedAt).toBeLessThanOrEqual(Date.now());
    expect(payout.approvalDueAt - payout.reviewRequestedAt).toBe(72 * 60 * 60 * 1000);
    expect(await t.run((ctx) => ctx.db.get("payouts", payout._id))).toEqual(payout);
  });

  test("returns optional earning context and exposes the payout only through authorized reads", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const submissionId = await seedSubmission(t, fixture, "approved");
    const { postId, campaignId } = await t.run(async (ctx) => {
      const assignment = await ctx.db.get("assignments", fixture.assignmentId);
      if (assignment === null) throw new Error("expected seeded assignment");
      const postId = await ctx.db.insert("posts", {
        submissionId,
        campaignId: assignment.campaignId,
        url: "https://x.com/creator/status/1234",
        xPostId: "1234",
        isActive: true,
        isVerified: true,
      });
      return { postId, campaignId: assignment.campaignId };
    });
    const earningPeriod = { startsAt: Date.now() - 86_400_000, endsAt: Date.now() - 1000 };
    const payout = await t.mutation(internal.payouts.create, {
      assignmentId: fixture.assignmentId,
      sourceKey: "views:period-1",
      amountCents: 2500,
      currency: "usd",
      postId,
      earningPeriod,
    });
    expect(payout).toMatchObject({ postId, campaignId, earningPeriod });

    const operator = await seedOperator(t, "operator");
    for (const caller of [fixture.asCreator, fixture.asCompany, operator]) {
      const visible = await caller.query(api.payouts.get, { payoutId: payout._id });
      expect(visible).toMatchObject({
        _id: payout._id,
        postId,
        earningPeriod,
        approvalDueAt: payout.approvalDueAt,
        approvalStatus: "pending",
      });
      expect(visible).not.toHaveProperty("sourceKey");
      const listed = await caller.query(api.payouts.list, {
        paginationOpts: firstPage,
        assignmentId: fixture.assignmentId,
        approvalStatus: "pending",
      });
      expect(listed.page).toEqual([visible]);
    }

    const outsiders = [
      await seedUser(t, { subject: "outside-creator" }),
      await seedUser(t, { subject: "outside-company", org: { id: "org_outside" } }),
    ];
    for (const caller of outsiders) {
      await expectApiError(
        () => caller.query(api.payouts.get, { payoutId: payout._id }),
        "not_found",
      );
      const listed = await caller.query(api.payouts.list, {
        paginationOpts: firstPage,
        assignmentId: fixture.assignmentId,
      });
      expect(listed.page).toEqual([]);
    }
  });

  test.each([
    "creatorId",
    "companyId",
    "campaignId",
    "reviewRequestedAt",
    "approvalDueAt",
    "approvalStatus",
    "paymentStatus",
    "approvedBy",
  ] as const)(
    "rejects a supplied %s instead of allowing creation to override it",
    async (field) => {
      const t = convexTest(schema, modules);
      const fixture = await seedAssignmentFixture(t);
      const assignment = await t.run((ctx) => ctx.db.get("assignments", fixture.assignmentId));
      if (assignment === null) throw new Error("expected seeded assignment");
      const forbiddenFields = {
        creatorId: fixture.creatorId,
        companyId: fixture.membership.companyId,
        campaignId: assignment.campaignId,
        reviewRequestedAt: 1000,
        approvalDueAt: 2000,
        approvalStatus: "approved",
        paymentStatus: "transferred",
        approvedBy: fixture.membership.userId,
      };
      const args = {
        assignmentId: fixture.assignmentId,
        sourceKey: "fixed-fee:published",
        amountCents: 12_345,
        currency: "usd",
        [field]: forbiddenFields[field],
      };

      await expect(t.mutation(internal.payouts.create, args)).rejects.toThrow(
        `Unexpected field \`${field}\``,
      );
      expect(
        await t.run((ctx) =>
          ctx.db
            .query("payouts")
            .withIndex("by_assignmentId_and_sourceKey", (q) =>
              q.eq("assignmentId", fixture.assignmentId).eq("sourceKey", args.sourceKey),
            )
            .unique(),
        ),
      ).toBeNull();
    },
  );
});

async function seedPayment(t: TestConvex, role: "admin" | "member" = "member") {
  const fixture = await seedAssignmentFixture(t, {}, role);
  const payoutId = await seedPayout(t, fixture.assignmentId, {
    sourceKey: "internal-earnings-event",
    amountCents: 12_345,
    currency: "usd",
    reviewRequestedAt: 1_800_000_000_000,
    approvalDueAt: 1_800_259_200_000,
    approvalStatus: "approved",
    approvedAt: 1_800_086_400_000,
    approvalSource: "company",
    approvedBy: fixture.membership.userId,
    paymentStatus: "queued",
  });
  return { ...fixture, payoutId };
}

describe("payouts.get", () => {
  test.each(["creator", "member", "admin", "operator"] as const)(
    "allows an authorized %s to read the public payout view",
    async (role) => {
      const t = convexTest(schema, modules);
      const fixture = await seedPayment(t, role === "admin" ? "admin" : "member");
      const caller =
        role === "operator"
          ? await seedOperator(t, "operator")
          : role === "creator"
            ? fixture.asCreator
            : fixture.asCompany;

      const result = await caller.query(api.payouts.get, { payoutId: fixture.payoutId });

      expect(result).toMatchObject({
        _id: fixture.payoutId,
        assignmentId: fixture.assignmentId,
        creatorId: fixture.creatorId,
        companyId: fixture.membership.companyId,
        amountCents: 12_345,
        currency: "usd",
        reviewRequestedAt: 1_800_000_000_000,
        approvalDueAt: 1_800_259_200_000,
        approvalStatus: "approved",
        approvedAt: 1_800_086_400_000,
        approvalSource: "company",
        paymentStatus: "queued",
      });
      expect(result).not.toHaveProperty("sourceKey");
      expect(result).not.toHaveProperty("approvedBy");
    },
  );

  test.each(["creator", "company"] as const)(
    "hides another %s's payout with the same error as a missing payout",
    async (role) => {
      const t = convexTest(schema, modules);
      const fixture = await seedPayment(t);
      const outsider = await seedUser(t, {
        subject: "outsider",
        ...(role === "company" ? { org: { id: "org_outside" } } : {}),
      });

      await expectApiError(
        () => outsider.query(api.payouts.get, { payoutId: fixture.payoutId }),
        "not_found",
      );
      await t.run(async (ctx) => await ctx.db.delete("payouts", fixture.payoutId));
      await expectApiError(
        () => fixture.asCreator.query(api.payouts.get, { payoutId: fixture.payoutId }),
        "not_found",
      );
    },
  );
});

describe.each(["get", "list"] as const)("payouts.%s authorization", (route) => {
  async function read(
    caller: Pick<TestConvex, "query">,
    fixture: Awaited<ReturnType<typeof seedPayment>>,
  ) {
    return route === "get"
      ? await caller.query(api.payouts.get, { payoutId: fixture.payoutId })
      : await caller.query(api.payouts.list, {
          assignmentId: fixture.assignmentId,
          paginationOpts: firstPage,
        });
  }

  test("rejects signed-out callers", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedPayment(t);
    await expectApiError(() => read(t, fixture), "not_authenticated");
  });

  test("rejects an unsynced account", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedPayment(t);
    const caller = t.withIdentity(workosIdentity({ subject: "unsynced" }));
    await expectApiError(() => read(caller, fixture), "not_synced");
  });

  test("rejects a forged company organization", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedPayment(t);
    const caller = await seedWrongOrgCaller(t);
    await expectApiError(() => read(caller, fixture), "forbidden");
  });

  test.each(["creator", "company"] as const)("rejects an inactive %s", async (role) => {
    const t = convexTest(schema, modules);
    const fixture = await seedPayment(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(
        "users",
        role === "creator" ? fixture.creatorUserId : fixture.membership.userId,
        { isActive: false },
      );
    });
    await expectApiError(
      () => read(role === "creator" ? fixture.asCreator : fixture.asCompany, fixture),
      "account_deactivated",
    );
  });
});

describe("payouts.list", () => {
  test.each(["creator", "member", "admin", "operator"] as const)(
    "returns public payout views to an authorized %s",
    async (role) => {
      const t = convexTest(schema, modules);
      const fixture = await seedPayment(t, role === "admin" ? "admin" : "member");
      const caller =
        role === "operator"
          ? await seedOperator(t, "operator")
          : role === "creator"
            ? fixture.asCreator
            : fixture.asCompany;

      const result = await caller.query(api.payouts.list, { paginationOpts: firstPage });

      expect(result.page).toHaveLength(1);
      expect(result.page[0]).toMatchObject({ _id: fixture.payoutId, amountCents: 12_345 });
      expect(result.page[0]).not.toHaveProperty("sourceKey");
      expect(result.page[0]).not.toHaveProperty("approvedBy");
      expect(result.isDone).toBe(true);
    },
  );

  test.each(["creator", "company"] as const)(
    "does not let a %s use scope filters to see someone else's payout",
    async (role) => {
      const t = convexTest(schema, modules);
      const fixture = await seedPayment(t);
      const outsider = await seedUser(t, {
        subject: "outsider",
        ...(role === "company" ? { org: { id: "org_outside" } } : {}),
      });
      const payout = await t.run(async (ctx) => await ctx.db.get("payouts", fixture.payoutId));
      if (payout === null) throw new Error("expected seeded payout");

      for (const filters of [
        {},
        { assignmentId: fixture.assignmentId },
        { campaignId: payout.campaignId },
        { assignmentId: fixture.assignmentId, campaignId: payout.campaignId },
      ]) {
        const result = await outsider.query(api.payouts.list, {
          ...filters,
          approvalStatus: "approved",
          paginationOpts: firstPage,
        });
        expect(result.page).toEqual([]);
        expect(result.isDone).toBe(true);
      }
    },
  );

  test.each(["creatorId", "companyId"] as const)(
    "does not accept a caller-supplied %s to override ownership",
    async (field) => {
      const t = convexTest(schema, modules);
      const fixture = await seedPayment(t);
      const args = {
        paginationOpts: firstPage,
        [field]: field === "creatorId" ? fixture.creatorId : fixture.membership.companyId,
      };
      await expect(fixture.asCreator.query(api.payouts.list, args)).rejects.toThrow(
        `Unexpected field \`${field}\``,
      );
    },
  );

  test("validates the approval status filter", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedPayment(t);
    await expect(
      fixture.asCreator.query(api.payouts.list, {
        paginationOpts: firstPage,
        // @ts-expect-error Prove runtime validation rejects arbitrary client strings.
        approvalStatus: "paid",
      }),
    ).rejects.toThrow("Validator error:");
  });
});
