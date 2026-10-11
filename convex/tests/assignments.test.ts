/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../_generated/api";
import { companyContext } from "../lib/functions";
import { deactivateUser } from "../models/users";
import schema from "../schema";
import {
  expectApiError,
  opportunityArgs,
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
    await owner.asCompany.mutation(api.assignments.markProductAccessDelivered, {
      assignmentIds: [assignmentId],
    });
    const stored = await t.run(async (ctx) => await ctx.db.get("assignments", assignmentId));

    const result = await owner.asCompany.query(api.assignments.list, {
      paginationOpts: firstPage,
    });

    expect(result.page).toStrictEqual([stored]);
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
  test.each([
    {
      phase: "current",
      pendingStatus: "termsPending",
      deliveredStatus: "active",
      excludedStatus: "completed",
    },
    {
      phase: "past",
      pendingStatus: "cancelled",
      deliveredStatus: "completed",
      excludedStatus: "active",
    },
  ] as const)(
    "paginates $phase deliveries without exposing actors or changing assignment fields",
    async ({ phase, pendingStatus, deliveredStatus, excludedStatus }) => {
      const t = convexTest(schema, modules);
      const { owner, asCreator, creatorId, assignmentId: pendingId } = await seedDeal(t);
      await t.run(
        async (ctx) => await ctx.db.patch("assignments", pendingId, { status: pendingStatus }),
      );
      const deliveredOpportunityId = await owner.asCompany.mutation(
        api.opportunities.create,
        opportunityArgs(owner.campaignId),
      );
      const deliveredId = await seedAssignment(t, {
        opportunityId: deliveredOpportunityId,
        creatorId,
        status: deliveredStatus,
      });
      const excludedOpportunityId = await owner.asCompany.mutation(
        api.opportunities.create,
        opportunityArgs(owner.campaignId),
      );
      await seedAssignment(t, {
        opportunityId: excludedOpportunityId,
        creatorId,
        status: excludedStatus,
      });
      vi.setSystemTime(0);
      await owner.asCompany.mutation(api.assignments.markProductAccessDelivered, {
        assignmentIds: [deliveredId],
      });
      const expected = await t.run(async (ctx) =>
        Promise.all(
          [deliveredId, pendingId].map(async (id) => {
            const assignment = await ctx.db.get("assignments", id);
            const creatorFields = { ...assignment };
            delete creatorFields.productAccessDeliveredBy;
            return creatorFields;
          }),
        ),
      );

      const first = await asCreator.query(api.assignments.listMine, {
        phase,
        paginationOpts: { numItems: 1, cursor: null },
      });
      expect(first.isDone).toBe(false);
      expect(first.continueCursor).toEqual(expect.any(String));

      const assignments = [...first.page];
      let result = first;
      for (let pageNumber = 0; !result.isDone && pageNumber < 5; pageNumber++) {
        result = await asCreator.query(api.assignments.listMine, {
          phase,
          paginationOpts: { numItems: 1, cursor: result.continueCursor },
        });
        assignments.push(...result.page);
      }

      expect(result.isDone).toBe(true);
      expect(assignments).toStrictEqual(expected);
      expect(assignments[0].productAccessDeliveredAt).toBe(0);
      expect(assignments[1]).not.toHaveProperty("productAccessDeliveredAt");
      for (const assignment of assignments) {
        expect(assignment).not.toHaveProperty("productAccessDeliveredBy");
      }
    },
  );

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
  test("hides the delivery actor from the creator while preserving delivery at timestamp zero", async () => {
    const t = convexTest(schema, modules);
    const { owner, asCreator, assignmentId } = await seedDeal(t);
    const asOperator = await seedOperator(t, "operator");
    vi.setSystemTime(0);
    await owner.asCompany.mutation(api.assignments.markProductAccessDelivered, {
      assignmentIds: [assignmentId],
    });
    const stored = await t.run(async (ctx) => await ctx.db.get("assignments", assignmentId));
    const creatorFields = { ...stored };
    delete creatorFields.productAccessDeliveredBy;

    const forCreator = await asCreator.query(api.assignments.get, { assignmentId });

    expect(forCreator).toStrictEqual(creatorFields);
    expect(forCreator.productAccessDeliveredAt).toBe(0);
    expect(forCreator).not.toHaveProperty("productAccessDeliveredBy");
    for (const caller of [owner.asCompany, asOperator]) {
      expect(await caller.query(api.assignments.get, { assignmentId })).toStrictEqual(stored);
    }
  });

  test("returns the assignment to its creator, its company, and an operator", async () => {
    const t = convexTest(schema, modules);
    const { owner, asCreator, assignmentId } = await seedDeal(t);
    const asOperator = await seedOperator(t, "operator");
    const stored = await t.run(async (ctx) => await ctx.db.get("assignments", assignmentId));

    for (const caller of [asCreator, owner.asCompany, asOperator]) {
      const assignment = await caller.query(api.assignments.get, { assignmentId });
      expect(assignment).toStrictEqual(stored);
      expect(assignment).not.toHaveProperty("productAccessDeliveredAt");
      expect(assignment).not.toHaveProperty("productAccessDeliveredBy");
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

describe("assignments.acceptTerms", () => {
  test.each([false, true])(
    "activates the calling creator's assignment with delivered=%s while hiding the audit actor",
    async (delivered) => {
      const t = convexTest(schema, modules);
      const { owner, asCreator, assignmentId } = await seedDeal(t);
      if (delivered) {
        await owner.asCompany.mutation(api.assignments.markProductAccessDelivered, {
          assignmentIds: [assignmentId],
        });
      }
      const before = await t.run(async (ctx) => await ctx.db.get("assignments", assignmentId));

      const result = await asCreator.mutation(api.assignments.acceptTerms, { assignmentId });

      const stored = await t.run(async (ctx) => await ctx.db.get("assignments", assignmentId));
      expect(stored).toStrictEqual({ ...before, status: "active" });
      const creatorFields = { ...stored };
      delete creatorFields.productAccessDeliveredBy;
      expect(result).toStrictEqual(creatorFields);
      expect(result).not.toHaveProperty("productAccessDeliveredBy");
      if (!delivered) expect(result).not.toHaveProperty("productAccessDeliveredAt");
    },
  );

  test("rejects a company user", async () => {
    const t = convexTest(schema, modules);
    const { owner, assignmentId } = await seedDeal(t);
    await expectApiError(
      () => owner.asCompany.mutation(api.assignments.acceptTerms, { assignmentId }),
      "forbidden",
    );
  });

  test("conceals another creator's assignment", async () => {
    const t = convexTest(schema, modules);
    const { assignmentId } = await seedDeal(t);
    const asOtherCreator = await seedUser(t, { subject: "other_creator" });
    await expectApiError(
      () => asOtherCreator.mutation(api.assignments.acceptTerms, { assignmentId }),
      "not_found",
    );
  });
});

describe("assignments.declineTerms", () => {
  test.each([false, true])(
    "cancels the calling creator's assignment with delivered=%s while hiding the audit actor",
    async (delivered) => {
      const t = convexTest(schema, modules);
      const { owner, asCreator, assignmentId } = await seedDeal(t);
      if (delivered) {
        await owner.asCompany.mutation(api.assignments.markProductAccessDelivered, {
          assignmentIds: [assignmentId],
        });
      }
      const before = await t.run(async (ctx) => await ctx.db.get("assignments", assignmentId));

      const result = await asCreator.mutation(api.assignments.declineTerms, { assignmentId });

      const stored = await t.run(async (ctx) => await ctx.db.get("assignments", assignmentId));
      expect(stored).toStrictEqual({ ...before, status: "cancelled" });
      const creatorFields = { ...stored };
      delete creatorFields.productAccessDeliveredBy;
      expect(result).toStrictEqual(creatorFields);
      expect(result).not.toHaveProperty("productAccessDeliveredBy");
      if (!delivered) expect(result).not.toHaveProperty("productAccessDeliveredAt");
    },
  );

  test("rejects a company user", async () => {
    const t = convexTest(schema, modules);
    const { owner, assignmentId } = await seedDeal(t);
    await expectApiError(
      () => owner.asCompany.mutation(api.assignments.declineTerms, { assignmentId }),
      "forbidden",
    );
  });
});

describe("assignments.cancel", () => {
  test("lets a company member cancel a termsPending assignment", async () => {
    const t = convexTest(schema, modules);
    const { owner, assignmentId } = await seedDeal(t);
    await owner.asCompany.mutation(api.assignments.markProductAccessDelivered, {
      assignmentIds: [assignmentId],
    });
    const before = await t.run(async (ctx) => await ctx.db.get("assignments", assignmentId));

    const result = await owner.asCompany.mutation(api.assignments.cancel, { assignmentId });

    expect(result).toStrictEqual({ ...before, status: "cancelled" });
    expect(result).toStrictEqual(
      await t.run(async (ctx) => await ctx.db.get("assignments", assignmentId)),
    );
  });

  test("rejects a creator", async () => {
    const t = convexTest(schema, modules);
    const { asCreator, assignmentId } = await seedDeal(t);
    await expectApiError(
      () => asCreator.mutation(api.assignments.cancel, { assignmentId }),
      "forbidden",
    );
  });

  test("conceals another company's assignment", async () => {
    const t = convexTest(schema, modules);
    const { assignmentId } = await seedDeal(t);
    const other = await seedOpportunity(t, { subject: "other", orgId: "org_other" });
    await expectApiError(
      () => other.asCompany.mutation(api.assignments.cancel, { assignmentId }),
      "not_found",
    );
  });

  test("rejects a forged organization claim", async () => {
    const t = convexTest(schema, modules);
    const { assignmentId } = await seedDeal(t);
    const asWrongOrg = await seedWrongOrgCaller(t);
    await expectApiError(
      () => asWrongOrg.mutation(api.assignments.cancel, { assignmentId }),
      "forbidden",
    );
  });
});

describe("assignments.markProductAccessDelivered", () => {
  test.each(["admin", "member"] as const)(
    "lets a company %s mark a teammate's assignment with the caller's audit identity",
    async (role) => {
      const t = convexTest(schema, modules);
      const { assignmentId } = await seedDeal(t);
      const asTeammate = await seedUser(t, {
        subject: "delivery-teammate",
        org: { id: "org_acme", role },
      });
      const { membership } = await asTeammate.run(async (ctx) => await companyContext(ctx));
      const before = await t.run(async (ctx) => await ctx.db.get("assignments", assignmentId));

      const result = await asTeammate.mutation(api.assignments.markProductAccessDelivered, {
        assignmentIds: [assignmentId],
      });

      const stored = await t.run(async (ctx) => await ctx.db.get("assignments", assignmentId));
      expect(stored).toStrictEqual({
        ...before,
        productAccessDeliveredAt: Date.now(),
        productAccessDeliveredBy: membership._id,
      });
      expect(result).toStrictEqual([stored]);
    },
  );

  test.each([
    { caller: "signed-out", code: "not_authenticated" },
    { caller: "creator", code: "forbidden" },
    { caller: "operator", code: "forbidden" },
    { caller: "wrong-org", code: "forbidden" },
    { caller: "deactivated", code: "account_deactivated" },
    { caller: "deleted-membership", code: "forbidden" },
  ] as const)(
    "rejects a $caller caller without changing the assignment",
    async ({ caller, code }) => {
      const t = convexTest(schema, modules);
      const { owner, asCreator, assignmentId } = await seedDeal(t);
      const before = await t.run(async (ctx) => await ctx.db.get("assignments", assignmentId));
      let asCaller = owner.asCompany;
      switch (caller) {
        case "signed-out":
          asCaller = t;
          break;
        case "creator":
          asCaller = asCreator;
          break;
        case "operator":
          asCaller = await seedOperator(t, "operator");
          break;
        case "wrong-org":
          asCaller = await seedWrongOrgCaller(t);
          break;
        case "deactivated":
          await t.run(async (ctx) => await deactivateUser(ctx, "owner"));
          break;
        case "deleted-membership":
          await t.run(async (ctx) => await ctx.db.delete("companyUsers", owner.membership._id));
          break;
      }

      await expectApiError(
        () =>
          asCaller.mutation(api.assignments.markProductAccessDelivered, {
            assignmentIds: [assignmentId],
          }),
        code,
      );

      expect(
        await t.run(async (ctx) => await ctx.db.get("assignments", assignmentId)),
      ).toStrictEqual(before);
    },
  );

  test.each(["companyId", "productAccessDeliveredBy", "productAccessDeliveredAt"] as const)(
    "rejects a client-supplied %s without marking delivery",
    async (field) => {
      const t = convexTest(schema, modules);
      const { owner, assignmentId } = await seedDeal(t);
      const before = await t.run(async (ctx) => await ctx.db.get("assignments", assignmentId));
      const forbiddenFields = {
        companyId: owner.membership.companyId,
        productAccessDeliveredBy: owner.membership._id,
        productAccessDeliveredAt: Date.now() - 60_000,
      };
      const args = { assignmentIds: [assignmentId], [field]: forbiddenFields[field] };

      await expect(
        owner.asCompany.mutation(api.assignments.markProductAccessDelivered, args),
      ).rejects.toThrow(`Unexpected field \`${field}\``);

      expect(
        await t.run(async (ctx) => await ctx.db.get("assignments", assignmentId)),
      ).toStrictEqual(before);
    },
  );

  test("conceals a foreign assignment and leaves the entire batch unchanged", async () => {
    const t = convexTest(schema, modules);
    const { owner, creatorId, assignmentId } = await seedDeal(t);
    const other = await seedOpportunity(t, { subject: "other", orgId: "org_other" });
    const foreignId = await seedAssignment(t, { opportunityId: other.opportunityId, creatorId });
    const assignmentIds = [assignmentId, foreignId];
    const before = await t.run(async (ctx) =>
      Promise.all(assignmentIds.map((id) => ctx.db.get("assignments", id))),
    );

    await expectApiError(
      () => owner.asCompany.mutation(api.assignments.markProductAccessDelivered, { assignmentIds }),
      "not_found",
    );

    expect(
      await t.run(async (ctx) =>
        Promise.all(assignmentIds.map((id) => ctx.db.get("assignments", id))),
      ),
    ).toStrictEqual(before);
  });

  test("returns bulk results in deduplicated order and preserves the original delivery on retry", async () => {
    const t = convexTest(schema, modules);
    const { owner, assignmentId } = await seedDeal(t);
    const secondCreatorId = await seedCreatorId(t, "second-creator");
    const secondId = await seedAssignment(t, {
      opportunityId: owner.opportunityId,
      creatorId: secondCreatorId,
    });
    const assignmentIds = [secondId, assignmentId, secondId];

    const result = await owner.asCompany.mutation(api.assignments.markProductAccessDelivered, {
      assignmentIds,
    });

    expect(result.map((assignment) => assignment._id)).toEqual([secondId, assignmentId]);
    for (const assignment of result) {
      expect(assignment).toMatchObject({
        productAccessDeliveredAt: Date.now(),
        productAccessDeliveredBy: owner.membership._id,
      });
    }
    const asTeammate = await seedUser(t, { subject: "retry-teammate", org: { id: "org_acme" } });
    vi.setSystemTime(Date.now() + 60_000);

    const retried = await asTeammate.mutation(api.assignments.markProductAccessDelivered, {
      assignmentIds,
    });

    expect(retried).toStrictEqual(result);
    expect(
      await t.run(async (ctx) =>
        Promise.all([secondId, assignmentId].map((id) => ctx.db.get("assignments", id))),
      ),
    ).toStrictEqual(result);
  });
});

describe("assignments.complete", () => {
  test("completes an active assignment for server-side callers", async () => {
    const t = convexTest(schema, modules);
    const { assignmentId } = await seedDeal(t);
    await t.run(
      async (ctx) => await ctx.db.patch("assignments", assignmentId, { status: "active" }),
    );

    const result = await t.mutation(internal.assignments.complete, { assignmentId });

    expect(result.status).toBe("completed");
  });
});
