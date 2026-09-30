/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import type { WithoutSystemFields } from "convex/server";
import { describe, expect, test } from "vitest";
import type { Doc, Id } from "../../_generated/dataModel";
import { companyContext } from "../../lib/functions";
import { createCampaign, requireCampaign } from "../../models/campaigns";
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
    status: "open",
    budgetCents: 250_000,
    startsAt: Date.now() + HOUR,
    ...overrides,
  };
}

describe("requireCampaign", () => {
  test.each(["draft", "open", "paused", "closed"] as const)(
    "returns an owned campaign with status %s",
    async (status) => {
      const t = convexTest(schema, modules);
      const owner = await seedOwner(t, "cg-owned");
      const doc = campaignDoc(owner, { status });
      const campaignId = await t.run(async (ctx) => await ctx.db.insert("campaigns", doc));

      const campaign = await t.run(
        async (ctx) => await requireCampaign(ctx, campaignId, owner.companyId),
      );

      expect(campaign).toMatchObject({ ...doc, _id: campaignId });
      expect(campaign.endsAt).toBeUndefined();
    },
  );

  test("throws not_found for a missing campaign", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOwner(t, "cg-missing");
    const campaignId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("campaigns", campaignDoc(owner));
      await ctx.db.delete("campaigns", id);
      return id;
    });

    await expect(
      t.run(async (ctx) => await requireCampaign(ctx, campaignId, owner.companyId)),
    ).rejects.toHaveProperty("data", { code: "not_found", message: "Not found", campaignId });
  });

  test("uses the same not_found error for another company's campaign", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOwner(t, "cg-owner", "org_acme");
    const other = await seedOwner(t, "cg-other", "org_other");
    const campaignId = await t.run(
      async (ctx) => await ctx.db.insert("campaigns", campaignDoc(owner)),
    );

    await expect(
      t.run(async (ctx) => await requireCampaign(ctx, campaignId, other.companyId)),
    ).rejects.toHaveProperty("data", { code: "not_found", message: "Not found", campaignId });
  });
});

describe("createCampaign", () => {
  test.each(["title", "objective", "product", "audience", "description"] as const)(
    "rejects blank %s in drafts and open campaigns without writing",
    async (field) => {
      const t = convexTest(schema, modules);
      const owner = await seedOwner(t, "ca-blank");

      for (const status of ["draft", "open"] as const) {
        for (const value of ["", " \t\n "]) {
          const doc = campaignDoc(owner, { status, [field]: value });

          await expect(t.run(async (ctx) => await createCampaign(ctx, doc))).rejects.toMatchObject({
            data: { code: "invalid_state", reason: `campaign_${field}_blank` },
          });
        }
      }
      expect(await t.run(async (ctx) => await ctx.db.query("campaigns").first())).toBeNull();
    },
  );

  test("trims brief fields while preserving internal whitespace", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOwner(t, "ca-trim");
    const doc = campaignDoc(owner, {
      title: "  Spring launch  ",
      objective: "  Introduce the new skincare range\n",
      product: "\tDaily moisturizer  ",
      audience: "  Gen Z skincare enthusiasts  ",
      description: "\nFirst paragraph.\n\nSecond paragraph.\n",
    });

    const id = await t.run(async (ctx) => await createCampaign(ctx, doc));
    const stored = await t.run(async (ctx) => await ctx.db.get("campaigns", id));

    expect(stored).toMatchObject({
      title: "Spring launch",
      objective: "Introduce the new skincare range",
      product: "Daily moisturizer",
      audience: "Gen Z skincare enthusiasts",
      description: "First paragraph.\n\nSecond paragraph.",
    });
  });

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

  test.each(["draft", "open"] as const)("creates a campaign with status %s", async (status) => {
    const t = convexTest(schema, modules);
    const owner = await seedOwner(t, `ca-status-ok-${status}`);
    const doc = campaignDoc(owner, { status });

    const id = await t.run(async (ctx) => await createCampaign(ctx, doc));
    const stored = await t.run(async (ctx) => await ctx.db.get("campaigns", id));

    expect(stored?.status).toBe(status);
  });

  test.each(["paused", "closed"] as const)(
    "rejects status %s without writing a campaign",
    async (status) => {
      const t = convexTest(schema, modules);
      const owner = await seedOwner(t, `ca-status-bad-${status}`);
      const doc = campaignDoc(owner, { status });

      await expect(t.run(async (ctx) => await createCampaign(ctx, doc))).rejects.toMatchObject({
        data: { code: "invalid_state", reason: "invalid_status" },
      });

      const campaigns = await t.run(async (ctx) => await ctx.db.query("campaigns").collect());
      expect(campaigns).toHaveLength(0);
    },
  );
});
