/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import schema from "../schema";
import {
  DAY,
  expectApiError,
  seedAssignmentFixture,
  seedOperator,
  seedPayout,
  seedUser,
  seedWrongOrgCaller,
  type TestConvex,
} from "./helpers";

const modules = import.meta.glob("../**/*.ts");
const range = { from: Date.UTC(2026, 10, 1), to: Date.UTC(2026, 10, 1) + 7 * DAY };

/** Verifies every company-home entry point enforces the same account boundary. */
async function expectHomeError(
  caller: Pick<TestConvex, "query">,
  code: Parameters<typeof expectApiError>[1],
) {
  await expectApiError(() => caller.query(api.companyHome.overview, range), code);
  await expectApiError(() => caller.query(api.companyHome.offers, { asOf: range.to }), code);
  await expectApiError(() => caller.query(api.companyHome.drafts, {}), code);
  await expectApiError(() => caller.query(api.companyHome.earnings, range), code);
}

describe("companyHome", () => {
  test("derives the company scope from current membership for every card", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    await seedPayout(t, fixture.assignmentId, { amount: 1_000 });
    const foreign = await seedUser(t, {
      subject: "other-company",
      org: { id: "org_other", role: "admin" },
    });

    expect(
      (await fixture.asCompany.query(api.companyHome.overview, range)).liveCampaigns.value,
    ).toBe(1);
    expect((await foreign.query(api.companyHome.overview, range)).liveCampaigns.value).toBe(0);
    expect(await foreign.query(api.companyHome.offers, { asOf: range.to })).toEqual({
      count: 0,
      rows: [],
      isPartial: false,
    });
    expect(await foreign.query(api.companyHome.drafts, {})).toEqual({
      count: 0,
      rows: [],
      isPartial: false,
    });
    expect((await foreign.query(api.companyHome.earnings, range)).pending.amounts).toEqual([]);
    expect(
      (await fixture.asCompany.query(api.companyHome.earnings, range)).pending.amounts,
    ).toEqual([{ currency: "usd", amount: 1_000 }]);
  });

  test("rejects signed-out callers", async () => {
    await expectHomeError(convexTest(schema, modules), "not_authenticated");
  });

  test("rejects creators", async () => {
    const t = convexTest(schema, modules);
    await expectHomeError(await seedUser(t, { subject: "creator" }), "forbidden");
  });

  test("rejects operators without company membership", async () => {
    const t = convexTest(schema, modules);
    await expectHomeError(await seedOperator(t, "operator"), "forbidden");
  });

  test("rejects a company user's identity for an organization they do not belong to", async () => {
    const t = convexTest(schema, modules);
    await expectHomeError(await seedWrongOrgCaller(t), "forbidden");
  });

  test("rejects an inactive company", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    await t.run((ctx) =>
      ctx.db.patch("companies", fixture.membership.companyId, { isActive: false }),
    );
    await expectHomeError(fixture.asCompany, "forbidden");
  });
});
