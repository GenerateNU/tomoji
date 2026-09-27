/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createOpportunity } from "../../models/opportunities";
import schema from "../../schema";
import { expectApiError, opportunityArgs, seedCampaign } from "../helpers";

const modules = import.meta.glob("../../**/*.ts");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-27T12:00:00Z"));
});

afterEach(() => vi.useRealTimers());

describe("createOpportunity", () => {
  test("accepts zero compensation and trims the brief", async () => {
    const t = convexTest(schema, modules);
    const { campaignId, membership } = await seedCampaign(t, { subject: "op_owner" });
    const args = opportunityArgs(campaignId, {
      title: "  Launch video  ",
      description: "  Show your routine.  ",
      fixedFeeCents: 0,
      cpmRateCents: 0,
      paymentCapCents: 0,
      maxSlots: 1,
      maxApplications: 1,
    });

    const id = await t.run(async (ctx) => await createOpportunity(ctx, membership, args));
    expect(await t.run(async (ctx) => await ctx.db.get("opportunities", id))).toMatchObject({
      ...args,
      title: "Launch video",
      description: "Show your routine.",
    });
  });

  test("saves a draft with an elapsed deadline", async () => {
    const t = convexTest(schema, modules);
    const { campaignId, membership } = await seedCampaign(t, {
      subject: "op_owner",
      status: "draft",
    });
    const args = opportunityArgs(campaignId, { status: "draft", deadline: Date.now() - 1 });

    const id = await t.run(async (ctx) => await createOpportunity(ctx, membership, args));
    expect(await t.run(async (ctx) => await ctx.db.get("opportunities", id))).toMatchObject(args);
  });
  test("stores the brief with campaign ownership and zero filled slots", async () => {
    const t = convexTest(schema, modules);
    const { campaignId, membership } = await seedCampaign(t, { subject: "op_owner" });
    const args = opportunityArgs(campaignId);

    const id = await t.run(async (ctx) => await createOpportunity(ctx, membership, args));
    const stored = await t.run(async (ctx) => await ctx.db.get("opportunities", id));

    expect(stored).toMatchObject({
      ...args,
      companyId: membership.companyId,
      createdBy: membership._id,
      numFilledSlots: 0,
    });
  });

  test("rejects a campaign owned by a different company without writing", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedCampaign(t, { subject: "op_owner" });
    const other = await seedCampaign(t, { subject: "op_other", orgId: "org_other" });

    await expectApiError(
      () =>
        t.run(
          async (ctx) =>
            await createOpportunity(ctx, owner.membership, opportunityArgs(other.campaignId)),
        ),
      "not_found",
    );
    expect(await t.run(async (ctx) => await ctx.db.query("opportunities").take(1))).toEqual([]);
  });

  test("treats a missing campaign like an inaccessible campaign", async () => {
    const t = convexTest(schema, modules);
    const { campaignId, membership } = await seedCampaign(t, { subject: "op_owner" });
    await t.run(async (ctx) => await ctx.db.delete("campaigns", campaignId));

    await expectApiError(
      () =>
        t.run(async (ctx) => await createOpportunity(ctx, membership, opportunityArgs(campaignId))),
      "not_found",
    );
  });

  test("allows a draft beneath a paused campaign", async () => {
    const t = convexTest(schema, modules);
    const { campaignId, membership } = await seedCampaign(t, {
      subject: "op_owner",
      status: "paused",
    });
    const args = opportunityArgs(campaignId, {
      status: "draft",
      productAccessLink: "https://example.com/product",
    });

    const id = await t.run(async (ctx) => await createOpportunity(ctx, membership, args));
    expect(await t.run(async (ctx) => await ctx.db.get("opportunities", id))).toMatchObject(args);
  });

  test("rejects publishing beneath a draft campaign", async () => {
    const t = convexTest(schema, modules);
    const { campaignId, membership } = await seedCampaign(t, {
      subject: "op_owner",
      status: "draft",
    });

    await expectApiError(
      () =>
        t.run(async (ctx) => await createOpportunity(ctx, membership, opportunityArgs(campaignId))),
      "invalid_state",
    );
  });

  test("rejects publishing beneath a paused campaign", async () => {
    const t = convexTest(schema, modules);
    const { campaignId, membership } = await seedCampaign(t, {
      subject: "op_owner",
      status: "paused",
    });

    await expectApiError(
      () =>
        t.run(async (ctx) => await createOpportunity(ctx, membership, opportunityArgs(campaignId))),
      "invalid_state",
    );
  });

  test("rejects creating beneath a closed campaign", async () => {
    const t = convexTest(schema, modules);
    const { campaignId, membership } = await seedCampaign(t, {
      subject: "op_owner",
      status: "closed",
    });

    await expectApiError(
      () =>
        t.run(
          async (ctx) =>
            await createOpportunity(
              ctx,
              membership,
              opportunityArgs(campaignId, { status: "draft" }),
            ),
        ),
      "invalid_state",
    );
  });

  test("rejects an inactive campaign company", async () => {
    const t = convexTest(schema, modules);
    const { campaignId, membership } = await seedCampaign(t, { subject: "op_owner" });
    await t.run(
      async (ctx) => await ctx.db.patch("companies", membership.companyId, { isActive: false }),
    );

    await expectApiError(
      () =>
        t.run(async (ctx) => await createOpportunity(ctx, membership, opportunityArgs(campaignId))),
      "not_found",
    );
  });

  test("rejects a paused initial opportunity state", async () => {
    const t = convexTest(schema, modules);
    const { campaignId, membership } = await seedCampaign(t, { subject: "op_owner" });

    await expectApiError(
      () =>
        t.run(
          async (ctx) =>
            await createOpportunity(
              ctx,
              membership,
              opportunityArgs(campaignId, { status: "paused" }),
            ),
        ),
      "invalid_state",
    );
  });

  test("rejects a closed initial opportunity state", async () => {
    const t = convexTest(schema, modules);
    const { campaignId, membership } = await seedCampaign(t, { subject: "op_owner" });

    await expectApiError(
      () =>
        t.run(
          async (ctx) =>
            await createOpportunity(
              ctx,
              membership,
              opportunityArgs(campaignId, { status: "closed" }),
            ),
        ),
      "invalid_state",
    );
  });

  test("rejects a blank title without writing", async () => {
    const t = convexTest(schema, modules);
    const { campaignId, membership } = await seedCampaign(t, { subject: "op_owner" });
    const args = opportunityArgs(campaignId, { title: "   " });

    await expectApiError(
      () => t.run(async (ctx) => await createOpportunity(ctx, membership, args)),
      "invalid_state",
    );
    expect(await t.run(async (ctx) => await ctx.db.query("opportunities").take(1))).toEqual([]);
  });

  test("rejects a blank description without writing", async () => {
    const t = convexTest(schema, modules);
    const { campaignId, membership } = await seedCampaign(t, { subject: "op_owner" });
    const args = opportunityArgs(campaignId, { description: "\n  " });

    await expectApiError(
      () => t.run(async (ctx) => await createOpportunity(ctx, membership, args)),
      "invalid_state",
    );
    expect(await t.run(async (ctx) => await ctx.db.query("opportunities").take(1))).toEqual([]);
  });

  test("rejects negative compensation without writing", async () => {
    const t = convexTest(schema, modules);
    const { campaignId, membership } = await seedCampaign(t, { subject: "op_owner" });
    const args = opportunityArgs(campaignId, { fixedFeeCents: -1 });

    await expectApiError(
      () => t.run(async (ctx) => await createOpportunity(ctx, membership, args)),
      "invalid_state",
    );
    expect(await t.run(async (ctx) => await ctx.db.query("opportunities").take(1))).toEqual([]);
  });

  test("rejects fractional CPM cents without writing", async () => {
    const t = convexTest(schema, modules);
    const { campaignId, membership } = await seedCampaign(t, { subject: "op_owner" });
    const args = opportunityArgs(campaignId, { cpmRateCents: 0.5 });

    await expectApiError(
      () => t.run(async (ctx) => await createOpportunity(ctx, membership, args)),
      "invalid_state",
    );
    expect(await t.run(async (ctx) => await ctx.db.query("opportunities").take(1))).toEqual([]);
  });

  test("rejects unsafe payment cap cents without writing", async () => {
    const t = convexTest(schema, modules);
    const { campaignId, membership } = await seedCampaign(t, { subject: "op_owner" });
    const args = opportunityArgs(campaignId, { paymentCapCents: Number.MAX_SAFE_INTEGER + 1 });

    await expectApiError(
      () => t.run(async (ctx) => await createOpportunity(ctx, membership, args)),
      "invalid_state",
    );
    expect(await t.run(async (ctx) => await ctx.db.query("opportunities").take(1))).toEqual([]);
  });

  test("rejects nonfinite compensation without writing", async () => {
    const t = convexTest(schema, modules);
    const { campaignId, membership } = await seedCampaign(t, { subject: "op_owner" });
    const args = opportunityArgs(campaignId, { fixedFeeCents: Number.NaN });

    await expectApiError(
      () => t.run(async (ctx) => await createOpportunity(ctx, membership, args)),
      "invalid_state",
    );
    expect(await t.run(async (ctx) => await ctx.db.query("opportunities").take(1))).toEqual([]);
  });

  test("rejects zero slots without writing", async () => {
    const t = convexTest(schema, modules);
    const { campaignId, membership } = await seedCampaign(t, { subject: "op_owner" });
    const args = opportunityArgs(campaignId, { maxSlots: 0 });

    await expectApiError(
      () => t.run(async (ctx) => await createOpportunity(ctx, membership, args)),
      "invalid_state",
    );
    expect(await t.run(async (ctx) => await ctx.db.query("opportunities").take(1))).toEqual([]);
  });

  test("rejects fractional slots without writing", async () => {
    const t = convexTest(schema, modules);
    const { campaignId, membership } = await seedCampaign(t, { subject: "op_owner" });
    const args = opportunityArgs(campaignId, { maxSlots: 1.5 });

    await expectApiError(
      () => t.run(async (ctx) => await createOpportunity(ctx, membership, args)),
      "invalid_state",
    );
    expect(await t.run(async (ctx) => await ctx.db.query("opportunities").take(1))).toEqual([]);
  });

  test("rejects zero application capacity without writing", async () => {
    const t = convexTest(schema, modules);
    const { campaignId, membership } = await seedCampaign(t, { subject: "op_owner" });
    const args = opportunityArgs(campaignId, { maxApplications: 0 });

    await expectApiError(
      () => t.run(async (ctx) => await createOpportunity(ctx, membership, args)),
      "invalid_state",
    );
    expect(await t.run(async (ctx) => await ctx.db.query("opportunities").take(1))).toEqual([]);
  });

  test("rejects unsafe application capacity without writing", async () => {
    const t = convexTest(schema, modules);
    const { campaignId, membership } = await seedCampaign(t, { subject: "op_owner" });
    const args = opportunityArgs(campaignId, { maxApplications: Number.MAX_SAFE_INTEGER + 1 });

    await expectApiError(
      () => t.run(async (ctx) => await createOpportunity(ctx, membership, args)),
      "invalid_state",
    );
    expect(await t.run(async (ctx) => await ctx.db.query("opportunities").take(1))).toEqual([]);
  });

  test("rejects an infinite deadline without writing", async () => {
    const t = convexTest(schema, modules);
    const { campaignId, membership } = await seedCampaign(t, { subject: "op_owner" });
    const args = opportunityArgs(campaignId, { deadline: Number.POSITIVE_INFINITY });

    await expectApiError(
      () => t.run(async (ctx) => await createOpportunity(ctx, membership, args)),
      "invalid_state",
    );
    expect(await t.run(async (ctx) => await ctx.db.query("opportunities").take(1))).toEqual([]);
  });

  test("rejects publishing with an elapsed deadline without writing", async () => {
    const t = convexTest(schema, modules);
    const { campaignId, membership } = await seedCampaign(t, { subject: "op_owner" });
    const args = opportunityArgs(campaignId, { deadline: Date.now() - 1 });

    await expectApiError(
      () => t.run(async (ctx) => await createOpportunity(ctx, membership, args)),
      "invalid_state",
    );
    expect(await t.run(async (ctx) => await ctx.db.query("opportunities").take(1))).toEqual([]);
  });
});
