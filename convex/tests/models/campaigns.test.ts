/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import type { WithoutSystemFields } from "convex/server";
import { describe, expect, test } from "vitest";
import type { Doc, Id } from "../../_generated/dataModel";
import { companyContext } from "../../lib/functions";
import { createCampaign } from "../../models/campaigns";
import schema from "../../schema";
import { expectApiError, seedUser, type TestConvex } from "../helpers";

const modules = import.meta.glob("../../**/*.ts");

const HOUR = 60 * 60 * 1000;

async function seedOwner(t: TestConvex, subject: string, orgId = "org_acme") {
  const as = await seedUser(t, { subject, org: { id: orgId } });
  return await as.run(async (ctx) => {
    const { membership } = await companyContext(ctx);
    return { companyId: membership.companyId, createdBy: membership._id };
  });
}

function campaignDoc(
  owner: { companyId: Id<"companies">; createdBy: Id<"companyUsers"> },
  overrides: Partial<WithoutSystemFields<Doc<"campaigns">>> = {},
): WithoutSystemFields<Doc<"campaigns">> {
  return {
    ...owner,
    title: "Spring launch",
    objective: "Introduce the new skincare range",
    product: "Daily moisturizer",
    audience: "Gen Z skincare enthusiasts",
    description: "Campaign supporting the spring launch.",
    budgetCents: 250_000,
    startsAt: Date.now() + HOUR,
    ...overrides,
  };
}

describe("createCampaign", () => {
  test("stores the campaign brief, budget, and schedule", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOwner(t, "ca1");
    const doc = campaignDoc(owner);

    const id = await t.run(async (ctx) => await createCampaign(ctx, doc));
    const stored = await t.run(async (ctx) => await ctx.db.get("campaigns", id));

    expect(stored).toMatchObject(doc);
    expect(stored?.endsAt).toBeUndefined();
  });

  test("persists an optional end time one millisecond after the start", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOwner(t, "ca2");
    const startsAt = Date.now() + HOUR;
    const doc = campaignDoc(owner, { startsAt, endsAt: startsAt + 1 });

    const id = await t.run(async (ctx) => await createCampaign(ctx, doc));
    const stored = await t.run(async (ctx) => await ctx.db.get("campaigns", id));

    expect(stored?.endsAt).toBe(doc.endsAt);
  });

  test("allows a campaign to start in the past with a zero budget", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOwner(t, "ca3");
    const doc = campaignDoc(owner, { startsAt: Date.now() - HOUR, budgetCents: 0 });

    const id = await t.run(async (ctx) => await createCampaign(ctx, doc));
    const stored = await t.run(async (ctx) => await ctx.db.get("campaigns", id));

    expect(stored).toMatchObject(doc);
  });

  test("rejects an end equal to the start without writing a campaign", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOwner(t, "ca4");
    const startsAt = Date.now() + HOUR;
    const doc = campaignDoc(owner, { startsAt, endsAt: startsAt });

    await expectApiError(
      () => t.run(async (ctx) => await createCampaign(ctx, doc)),
      "invalid_state",
    );

    const campaigns = await t.run(async (ctx) => await ctx.db.query("campaigns").collect());
    expect(campaigns).toHaveLength(0);
  });

  test.each([-1, 0.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid budget %s without writing a campaign",
    async (budgetCents) => {
      const t = convexTest(schema, modules);
      const owner = await seedOwner(t, "ca5");
      const doc = campaignDoc(owner, { budgetCents });

      await expectApiError(
        () => t.run(async (ctx) => await createCampaign(ctx, doc)),
        "invalid_state",
      );

      const campaigns = await t.run(async (ctx) => await ctx.db.query("campaigns").collect());
      expect(campaigns).toHaveLength(0);
    },
  );

  test.each([
    { startsAt: Number.NaN },
    { startsAt: Number.POSITIVE_INFINITY },
    { endsAt: Number.NaN },
    { endsAt: Number.NEGATIVE_INFINITY },
    { startsAt: 2, endsAt: 1 },
  ])("rejects invalid schedule %j without writing a campaign", async (schedule) => {
    const t = convexTest(schema, modules);
    const owner = await seedOwner(t, "ca6");
    const doc = campaignDoc(owner, schedule);

    await expectApiError(
      () => t.run(async (ctx) => await createCampaign(ctx, doc)),
      "invalid_state",
    );

    const campaigns = await t.run(async (ctx) => await ctx.db.query("campaigns").collect());
    expect(campaigns).toHaveLength(0);
  });
});
