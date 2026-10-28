/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import schema from "../schema";
import {
  expectApiError,
  seedAssignmentFixture,
  seedOperator,
  seedPayout,
  seedUser,
  seedWrongOrgCaller,
  workosIdentity,
  type TestConvex,
} from "./helpers";

const modules = import.meta.glob("../**/*.ts");
const firstPage = { numItems: 10, cursor: null };

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
