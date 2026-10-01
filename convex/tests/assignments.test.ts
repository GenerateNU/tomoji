/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../_generated/api";
import { deactivateUser } from "../models/users";
import schema from "../schema";
import { expectApiError, seedCreatorId, seedOperator, seedOpportunity, seedUser } from "./helpers";

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
