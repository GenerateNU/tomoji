/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import { COUNT_CAP } from "../models/operators";
import schema from "../schema";
import {
  expectApiError,
  seedAssignment,
  seedAssignmentFixture,
  seedCreatorId,
  seedDispute,
  seedOperator,
  seedOpportunity,
  seedUser,
  type TestConvex,
} from "./helpers";

const modules = import.meta.glob("../**/*.ts");

const zero = { value: 0, capped: false };

describe("operators.overview", () => {
  test("counts an empty deployment as zero everywhere", async () => {
    const t = convexTest(schema, modules);
    const asOperator = await seedOperator(t, "overview_empty");

    expect(await asOperator.query(api.operators.overview, {})).toEqual({
      companies: zero,
      activeCompanies: zero,
      activeCreators: zero,
      openDisputes: zero,
      openOpportunities: zero,
      activeAssignments: zero,
    });
  });

  test("counts creators, companies and open briefs", async () => {
    const t = convexTest(schema, modules);
    const asOperator = await seedOperator(t, "overview_counts");
    await seedCreatorId(t, "overview_creator_a");
    await seedCreatorId(t, "overview_creator_b");
    await seedOpportunity(t, { subject: "overview_owner", orgId: "org_overview" });

    const overview = await asOperator.query(api.operators.overview, {});

    expect(overview.activeCreators).toEqual({ value: 2, capped: false });
    expect(overview.companies).toEqual({ value: 1, capped: false });
    expect(overview.activeCompanies).toEqual({ value: 1, capped: false });
    expect(overview.openOpportunities).toEqual({ value: 1, capped: false });
  });

  test("leaves deactivated creators and inactive companies out of the active counts", async () => {
    const t = convexTest(schema, modules);
    const asOperator = await seedOperator(t, "overview_inactive");
    await seedCreatorId(t, "overview_retired");
    await seedUser(t, {
      subject: "overview_member",
      org: { id: "org_dormant", name: "Dormant", role: "admin" },
    });
    await deactivate(t, "overview_retired");
    await t.run(async (ctx) => {
      const company = await ctx.db
        .query("companies")
        .withIndex("by_workosId", (q) => q.eq("workosId", "org_dormant"))
        .unique();
      if (company === null) throw new Error("expected seeded company");
      await ctx.db.patch("companies", company._id, { isActive: false });
    });

    const overview = await asOperator.query(api.operators.overview, {});

    expect(overview.activeCreators).toEqual(zero);
    expect(overview.companies).toEqual({ value: 1, capped: false });
    expect(overview.activeCompanies).toEqual(zero);
  });

  test("counts only open disputes and active assignments", async () => {
    const t = convexTest(schema, modules);
    const asOperator = await seedOperator(t, "overview_work");
    const fixture = await seedAssignmentFixture(t);
    await seedDispute(t, fixture);
    await seedDispute(
      t,
      fixture,
      {},
      {
        resolvedBy: fixture.creatorUserId,
        resolvedByRole: "creator",
        resolvedAt: Date.now(),
        outcome: "withdrawn",
      },
    );
    await t.run(async (ctx) => {
      await ctx.db.patch("assignments", fixture.assignmentId, { status: "active" });
    });
    const otherCreator = await seedCreatorId(t, "overview_other_creator");
    const assignment = await t.run(
      async (ctx) => await ctx.db.get("assignments", fixture.assignmentId),
    );
    if (assignment === null) throw new Error("expected seeded assignment");
    await seedAssignment(t, {
      opportunityId: assignment.opportunityId,
      creatorId: otherCreator,
      status: "completed",
    });

    const overview = await asOperator.query(api.operators.overview, {});

    expect(overview.openDisputes).toEqual({ value: 1, capped: false });
    expect(overview.activeAssignments).toEqual({ value: 1, capped: false });
  });

  test("stops at the cap and says the real total is higher", async () => {
    const t = convexTest(schema, modules);
    const asOperator = await seedOperator(t, "overview_capped");
    await t.run(async (ctx) => {
      for (let index = 0; index <= COUNT_CAP; index++) {
        await ctx.db.insert("companies", {
          workosId: `org_bulk_${index}`,
          name: `Bulk ${index}`,
          isActive: true,
        });
      }
    });

    const { companies } = await asOperator.query(api.operators.overview, {});

    expect(companies).toEqual({ value: COUNT_CAP, capped: true });
  });

  test.each([
    { who: "a creator", seed: (t: TestConvex) => seedUser(t, { subject: "overview_creator" }) },
    {
      who: "a company user",
      seed: (t: TestConvex) =>
        seedUser(t, { subject: "overview_company", org: { id: "org_deny", role: "admin" } }),
    },
  ])("rejects $who", async ({ seed }) => {
    const t = convexTest(schema, modules);
    const caller = await seed(t);

    await expectApiError(() => caller.query(api.operators.overview, {}), "forbidden");
  });

  test("rejects a signed-out caller", async () => {
    const t = convexTest(schema, modules);

    await expectApiError(() => t.query(api.operators.overview, {}), "not_authenticated");
  });
});

async function deactivate(t: TestConvex, subject: string) {
  await t.run(async (ctx) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_workosId", (q) => q.eq("workosId", subject))
      .unique();
    if (user === null) throw new Error("expected seeded user");
    await ctx.db.patch("users", user._id, { isActive: false });
  });
}
