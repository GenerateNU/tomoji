/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../_generated/api";
import { deactivateUser } from "../models/users";
import schema from "../schema";
import {
  expectApiError,
  seedAssignment,
  seedCreatorId,
  seedOperator,
  seedOpportunity,
  seedUser,
  seedWrongOrgCaller,
  type TestConvex,
} from "./helpers";

const modules = import.meta.glob("../**/*.ts");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-27T12:00:00Z"));
});

afterEach(() => vi.useRealTimers());

describe("assignments.claim", () => {
  test("creates an assignment for the calling creator", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "owner" });
    const asCreator = await seedUser(t, { subject: "creator" });

    const assignmentId = await asCreator.mutation(api.assignments.claim, {
      opportunityId: owner.opportunityId,
    });

    const creatorId = await seedCreatorId(t, "creator");
    const assignment = await t.run(async (ctx) => await ctx.db.get("assignments", assignmentId));
    expect(assignment).toMatchObject({
      creatorId,
      opportunityId: owner.opportunityId,
      companyId: owner.membership.companyId,
      status: "termsPending",
    });
  });

  test("rejects a signed-out caller", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "owner" });
    await expectApiError(
      () => t.mutation(api.assignments.claim, { opportunityId: owner.opportunityId }),
      "not_authenticated",
    );
  });

  test("rejects a company user", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "owner" });
    await expectApiError(
      () => owner.asCompany.mutation(api.assignments.claim, { opportunityId: owner.opportunityId }),
      "forbidden",
    );
  });

  test("rejects an operator", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "owner" });
    const asOperator = await seedOperator(t, "operator");
    await expectApiError(
      () => asOperator.mutation(api.assignments.claim, { opportunityId: owner.opportunityId }),
      "forbidden",
    );
  });

  test("rejects a deactivated creator", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "owner" });
    const asCreator = await seedUser(t, { subject: "creator" });
    await t.run(async (ctx) => await deactivateUser(ctx, "creator"));
    await expectApiError(
      () => asCreator.mutation(api.assignments.claim, { opportunityId: owner.opportunityId }),
      "account_deactivated",
    );
  });

  test("does not let a creator claim on behalf of another creator", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "owner" });
    const asCreator = await seedUser(t, { subject: "creator" });
    const otherCreatorId = await seedCreatorId(t, "other_creator");
    const args = { opportunityId: owner.opportunityId, creatorId: otherCreatorId };
    await expect(asCreator.mutation(api.assignments.claim, args)).rejects.toThrow(
      "Unexpected field `creatorId`",
    );
  });
});

const firstPage = { numItems: 10, cursor: null };

/** Seeds an owned opportunity, a signed-in creator, and one assignment between them. */
async function seedDeal(t: TestConvex) {
  const owner = await seedOpportunity(t, { subject: "owner" });
  const asCreator = await seedUser(t, { subject: "creator" });
  const creatorId = await seedCreatorId(t, "creator");
  const assignmentId = await seedAssignment(t, {
    opportunityId: owner.opportunityId,
    creatorId,
  });
  return { owner, asCreator, creatorId, assignmentId };
}

describe("assignments.list", () => {
  test("lists the caller's company assignments", async () => {
    const t = convexTest(schema, modules);
    const { owner, assignmentId } = await seedDeal(t);

    const result = await owner.asCompany.query(api.assignments.list, {
      paginationOpts: firstPage,
    });

    expect(result.page.map((assignment) => assignment._id)).toEqual([assignmentId]);
  });

  test("rejects a creator", async () => {
    const t = convexTest(schema, modules);
    const { asCreator } = await seedDeal(t);
    await expectApiError(
      () => asCreator.query(api.assignments.list, { paginationOpts: firstPage }),
      "forbidden",
    );
  });

  test("rejects a forged organization claim", async () => {
    const t = convexTest(schema, modules);
    await seedDeal(t);
    const asWrongOrg = await seedWrongOrgCaller(t);
    await expectApiError(
      () => asWrongOrg.query(api.assignments.list, { paginationOpts: firstPage }),
      "forbidden",
    );
  });

  test("does not accept a company to list", async () => {
    const t = convexTest(schema, modules);
    const { owner } = await seedDeal(t);
    const args = { paginationOpts: firstPage, companyId: owner.membership.companyId };
    await expect(owner.asCompany.query(api.assignments.list, args)).rejects.toThrow(
      "Unexpected field `companyId`",
    );
  });
});

describe("assignments.listMine", () => {
  test("lists the calling creator's current assignments", async () => {
    const t = convexTest(schema, modules);
    const { asCreator, assignmentId } = await seedDeal(t);

    const result = await asCreator.query(api.assignments.listMine, {
      phase: "current",
      paginationOpts: firstPage,
    });

    expect(result.page.map((assignment) => assignment._id)).toEqual([assignmentId]);
  });

  test("rejects a company user", async () => {
    const t = convexTest(schema, modules);
    const { owner } = await seedDeal(t);
    await expectApiError(
      () =>
        owner.asCompany.query(api.assignments.listMine, {
          phase: "current",
          paginationOpts: firstPage,
        }),
      "forbidden",
    );
  });
});

describe("assignments.get", () => {
  test("returns the assignment to its creator, its company, and an operator", async () => {
    const t = convexTest(schema, modules);
    const { owner, asCreator, assignmentId } = await seedDeal(t);
    const asOperator = await seedOperator(t, "operator");

    for (const caller of [asCreator, owner.asCompany, asOperator]) {
      const assignment = await caller.query(api.assignments.get, { assignmentId });
      expect(assignment._id).toBe(assignmentId);
    }
  });

  test("conceals the assignment from another creator and another company", async () => {
    const t = convexTest(schema, modules);
    const { assignmentId } = await seedDeal(t);
    const asOtherCreator = await seedUser(t, { subject: "other_creator" });
    const other = await seedOpportunity(t, { subject: "other", orgId: "org_other" });

    for (const caller of [asOtherCreator, other.asCompany]) {
      await expectApiError(() => caller.query(api.assignments.get, { assignmentId }), "not_found");
    }
  });

  test("rejects a signed-out caller", async () => {
    const t = convexTest(schema, modules);
    const { assignmentId } = await seedDeal(t);
    await expectApiError(() => t.query(api.assignments.get, { assignmentId }), "not_authenticated");
  });

  test("rejects a forged organization claim", async () => {
    const t = convexTest(schema, modules);
    const { assignmentId } = await seedDeal(t);
    const asWrongOrg = await seedWrongOrgCaller(t);
    await expectApiError(
      () => asWrongOrg.query(api.assignments.get, { assignmentId }),
      "forbidden",
    );
  });
});
