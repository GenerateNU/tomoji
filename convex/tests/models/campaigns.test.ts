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
    description: "Short-form video for the spring launch.",
    format: "video",
    status: "draft",
    isVetted: false,
    maxApplications: 10,
    maxOpenings: 3,
    deadline: Date.now() + HOUR,
    ...overrides,
  };
}

describe("createCampaign", () => {
  test("stores a campaign and returns its id", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOwner(t, "ca1");

    const id = await t.run(async (ctx) => await createCampaign(ctx, campaignDoc(owner)));
    const stored = await t.run(async (ctx) => await ctx.db.get(id));

    expect(stored).not.toBeNull();
    expect(stored?.title).toBe("Spring launch");
    expect(stored?.companyId).toBe(owner.companyId);
    expect(stored?.createdBy).toBe(owner.createdBy);
    expect(stored?.status).toBe("draft");
  });

  test("persists the optional brief fields", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOwner(t, "ca2");
    const doc = campaignDoc(owner, {
      audience: "Gen Z skincare enthusiasts",
      talkingPoints: ["Vegan formula", "Cruelty-free"],
      prohibitedClaims: ["Medical claims"],
      disclosureRequirements: ["#ad"],
      usageRights: "90 days paid usage",
    });

    const id = await t.run(async (ctx) => await createCampaign(ctx, doc));
    const stored = await t.run(async (ctx) => await ctx.db.get(id));

    expect(stored?.audience).toBe(doc.audience);
    expect(stored?.talkingPoints).toEqual(doc.talkingPoints);
    expect(stored?.prohibitedClaims).toEqual(doc.prohibitedClaims);
    expect(stored?.disclosureRequirements).toEqual(doc.disclosureRequirements);
    expect(stored?.usageRights).toBe(doc.usageRights);
  });

  test("leaves the optional brief fields unset when they are omitted", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOwner(t, "ca3");

    const id = await t.run(async (ctx) => await createCampaign(ctx, campaignDoc(owner)));
    const stored = await t.run(async (ctx) => await ctx.db.get(id));

    expect(stored?.audience).toBeUndefined();
    expect(stored?.talkingPoints).toBeUndefined();
    expect(stored?.usageRights).toBeUndefined();
  });

  test("rejects a deadline in the past", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOwner(t, "ca4");
    const doc = campaignDoc(owner, { deadline: Date.now() - HOUR });

    await expectApiError(
      () => t.run(async (ctx) => await createCampaign(ctx, doc)),
      "invalid_state",
    );
  });

  test("rejects a deadline that has already been reached", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOwner(t, "ca5");
    const deadline = Date.now();
    const doc = campaignDoc(owner, { deadline });

    await expectApiError(
      () => t.run(async (ctx) => await createCampaign(ctx, doc)),
      "invalid_state",
    );
  });

  test("rejects zero openings", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOwner(t, "ca6");
    const doc = campaignDoc(owner, { maxOpenings: 0, maxApplications: 5 });

    await expectApiError(
      () => t.run(async (ctx) => await createCampaign(ctx, doc)),
      "invalid_state",
    );
  });

  test("rejects a negative number of openings", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOwner(t, "ca7");
    const doc = campaignDoc(owner, { maxOpenings: -1, maxApplications: 5 });

    await expectApiError(
      () => t.run(async (ctx) => await createCampaign(ctx, doc)),
      "invalid_state",
    );
  });

  test("rejects max applications below max openings", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOwner(t, "ca9");
    const doc = campaignDoc(owner, { maxOpenings: 5, maxApplications: 2 });

    await expectApiError(
      () => t.run(async (ctx) => await createCampaign(ctx, doc)),
      "invalid_state",
    );
  });

  test("accepts max applications equal to max openings", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOwner(t, "ca11");
    const doc = campaignDoc(owner, { maxOpenings: 3, maxApplications: 3 });

    const id = await t.run(async (ctx) => await createCampaign(ctx, doc));
    const stored = await t.run(async (ctx) => await ctx.db.get(id));

    expect(stored).not.toBeNull();
    expect(stored?.maxOpenings).toBe(3);
    expect(stored?.maxApplications).toBe(3);
  });

  test("rejects a campaign created as closed", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOwner(t, "ca12");
    const doc = campaignDoc(owner, { status: "closed" });

    await expectApiError(
      () => t.run(async (ctx) => await createCampaign(ctx, doc)),
      "invalid_state",
    );
  });

  test("does not write a row when validation fails", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOwner(t, "ca10");
    const doc = campaignDoc(owner, { deadline: Date.now() - HOUR });

    await expectApiError(
      () => t.run(async (ctx) => await createCampaign(ctx, doc)),
      "invalid_state",
    );

    const campaigns = await t.run(async (ctx) => await ctx.db.query("campaigns").collect());
    expect(campaigns).toHaveLength(0);
  });
});
