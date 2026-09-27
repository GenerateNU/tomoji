/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../_generated/api";
import schema from "../schema";
import {
  expectApiError,
  opportunityArgs,
  seedCampaign,
  seedOperator,
  seedOpportunity,
  seedUser,
  seedWrongOrgCaller,
  workosIdentity,
} from "./helpers";

const modules = import.meta.glob("../**/*.ts");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-27T12:00:00Z"));
});

afterEach(() => vi.useRealTimers());

describe("opportunities.create", () => {
  test("rejects an inactive company through the shared membership guard", async () => {
    const t = convexTest(schema, modules);
    const { asCompany, campaignId, membership } = await seedCampaign(t, { subject: "op_inactive" });
    await t.run(
      async (ctx) => await ctx.db.patch("companies", membership.companyId, { isActive: false }),
    );

    await expectApiError(
      () => asCompany.mutation(api.opportunities.create, opportunityArgs(campaignId)),
      "forbidden",
    );
    expect(await t.run(async (ctx) => await ctx.db.query("opportunities").take(1))).toEqual([]);
  });

  test("allows a company admin to save a draft", async () => {
    const t = convexTest(schema, modules);
    const { asCompany, campaignId } = await seedCampaign(t, {
      subject: "op_admin",
      role: "admin",
      status: "draft",
    });

    const id = await asCompany.mutation(
      api.opportunities.create,
      opportunityArgs(campaignId, { status: "draft" }),
    );
    expect(await t.run(async (ctx) => await ctx.db.get("opportunities", id))).toMatchObject({
      status: "draft",
      numFilledSlots: 0,
    });
  });

  test("rejects a signed-out caller", async () => {
    const t = convexTest(schema, modules);
    const { campaignId } = await seedCampaign(t, { subject: "op_owner" });

    await expectApiError(
      () => t.mutation(api.opportunities.create, opportunityArgs(campaignId)),
      "not_authenticated",
    );
  });

  test("rejects a creator", async () => {
    const t = convexTest(schema, modules);
    const { campaignId } = await seedCampaign(t, { subject: "op_owner" });
    const asCreator = await seedUser(t, { subject: "op_creator" });

    await expectApiError(
      () => asCreator.mutation(api.opportunities.create, opportunityArgs(campaignId)),
      "forbidden",
    );
  });

  test("rejects an operator", async () => {
    const t = convexTest(schema, modules);
    const { campaignId } = await seedCampaign(t, { subject: "op_owner" });
    const asOperator = await seedOperator(t, "op_operator");

    await expectApiError(
      () => asOperator.mutation(api.opportunities.create, opportunityArgs(campaignId)),
      "forbidden",
    );
  });

  test("rejects creating in another company's campaign", async () => {
    const t = convexTest(schema, modules);
    const { campaignId } = await seedCampaign(t, { subject: "op_owner" });
    const asOther = await seedUser(t, { subject: "op_other", org: { id: "org_other" } });

    await expectApiError(
      () => asOther.mutation(api.opportunities.create, opportunityArgs(campaignId)),
      "not_found",
    );
    expect(await t.run(async (ctx) => await ctx.db.query("opportunities").take(1))).toEqual([]);
  });

  test("rejects a forged organization claim", async () => {
    const t = convexTest(schema, modules);
    const { campaignId } = await seedCampaign(t, { subject: "op_owner", orgId: "org_other" });
    const asWrongOrg = await seedWrongOrgCaller(t);

    await expectApiError(
      () => asWrongOrg.mutation(api.opportunities.create, opportunityArgs(campaignId)),
      "forbidden",
    );
  });

  test("rejects a caller-supplied companyId", async () => {
    const t = convexTest(schema, modules);
    const { asCompany, campaignId, membership } = await seedCampaign(t, { subject: "op_owner" });
    const args = { ...opportunityArgs(campaignId), companyId: membership.companyId };

    await expect(asCompany.mutation(api.opportunities.create, args)).rejects.toThrow(
      "Unexpected field `companyId`",
    );
    expect(await t.run(async (ctx) => await ctx.db.query("opportunities").take(1))).toEqual([]);
  });

  test("rejects caller-supplied attribution", async () => {
    const t = convexTest(schema, modules);
    const { asCompany, campaignId, membership } = await seedCampaign(t, { subject: "op_owner" });
    const args = { ...opportunityArgs(campaignId), createdBy: membership._id };

    await expect(asCompany.mutation(api.opportunities.create, args)).rejects.toThrow(
      "Unexpected field `createdBy`",
    );
  });

  test("rejects caller-supplied filled slots", async () => {
    const t = convexTest(schema, modules);
    const { asCompany, campaignId } = await seedCampaign(t, { subject: "op_owner" });
    const args = { ...opportunityArgs(campaignId), numFilledSlots: 5 };

    await expect(asCompany.mutation(api.opportunities.create, args)).rejects.toThrow(
      "Unexpected field `numFilledSlots`",
    );
  });

  test("derives ownership and attribution for a company member", async () => {
    const t = convexTest(schema, modules);
    const { asCompany, campaignId, membership } = await seedCampaign(t, { subject: "op_member" });
    const args = opportunityArgs(campaignId);

    const id = await asCompany.mutation(api.opportunities.create, args);
    const stored = await t.run(async (ctx) => await ctx.db.get("opportunities", id));

    expect(stored).toMatchObject({
      ...args,
      companyId: membership.companyId,
      createdBy: membership._id,
      numFilledSlots: 0,
    });
  });
});

describe("opportunities.get", () => {
  test("allows a creator to view a gated open opportunity", async () => {
    const t = convexTest(schema, modules);
    const { opportunityId } = await seedOpportunity(t, { subject: "op_owner" }, { isGated: true });
    const asCreator = await seedUser(t, { subject: "op_creator" });

    expect(await asCreator.query(api.opportunities.get, { opportunityId })).toMatchObject({
      _id: opportunityId,
      isGated: true,
    });
  });

  test("allows the owner to read its own draft", async () => {
    const t = convexTest(schema, modules);
    const { asCompany, opportunityId } = await seedOpportunity(
      t,
      { subject: "op_owner" },
      { status: "draft" },
    );

    expect(await asCompany.query(api.opportunities.get, { opportunityId })).toMatchObject({
      _id: opportunityId,
      status: "draft",
    });
  });

  test("allows another member of the same company to read a draft", async () => {
    const t = convexTest(schema, modules);
    const { opportunityId } = await seedOpportunity(
      t,
      { subject: "op_owner" },
      { status: "draft" },
    );
    const asColleague = await seedUser(t, { subject: "op_colleague", org: { id: "org_acme" } });

    expect(await asColleague.query(api.opportunities.get, { opportunityId })).toMatchObject({
      _id: opportunityId,
      status: "draft",
    });
  });

  test("allows an operator to inspect a closed opportunity", async () => {
    const t = convexTest(schema, modules);
    const { opportunityId } = await seedOpportunity(t, { subject: "op_owner" });
    await t.run(
      async (ctx) => await ctx.db.patch("opportunities", opportunityId, { status: "closed" }),
    );
    const asOperator = await seedOperator(t, "op_operator");

    expect(await asOperator.query(api.opportunities.get, { opportunityId })).toMatchObject({
      _id: opportunityId,
      status: "closed",
    });
  });

  test("hides even open opportunities from another company", async () => {
    const t = convexTest(schema, modules);
    const { opportunityId } = await seedOpportunity(t, { subject: "op_owner" });
    const asOther = await seedUser(t, { subject: "op_other", org: { id: "org_other" } });

    await expectApiError(
      () => asOther.query(api.opportunities.get, { opportunityId }),
      "not_found",
    );
  });

  test("rejects a forged organization claim on reads", async () => {
    const t = convexTest(schema, modules);
    const { opportunityId } = await seedOpportunity(t, { subject: "op_owner", orgId: "org_other" });
    const asWrongOrg = await seedWrongOrgCaller(t);

    await expectApiError(
      () => asWrongOrg.query(api.opportunities.get, { opportunityId }),
      "forbidden",
    );
  });

  test("rejects a company token without an organization", async () => {
    const t = convexTest(schema, modules);
    const { opportunityId } = await seedOpportunity(t, { subject: "op_owner" });
    const asNoOrg = t.withIdentity(workosIdentity({ subject: "op_owner" }));

    await expectApiError(
      () => asNoOrg.query(api.opportunities.get, { opportunityId }),
      "misconfigured",
    );
  });

  test("hides drafts from a creator through the route", async () => {
    const t = convexTest(schema, modules);
    const { opportunityId } = await seedOpportunity(
      t,
      { subject: "op_owner" },
      { status: "draft" },
    );
    const asCreator = await seedUser(t, { subject: "op_creator" });

    await expectApiError(
      () => asCreator.query(api.opportunities.get, { opportunityId }),
      "not_found",
    );
  });

  test("rejects a signed-out reader", async () => {
    const t = convexTest(schema, modules);
    const { opportunityId } = await seedOpportunity(t, { subject: "op_owner" });

    await expectApiError(
      () => t.query(api.opportunities.get, { opportunityId }),
      "not_authenticated",
    );
  });

  test("rejects an unsynced reader", async () => {
    const t = convexTest(schema, modules);
    const { opportunityId } = await seedOpportunity(t, { subject: "op_owner" });
    const asUnsynced = t.withIdentity(workosIdentity({ subject: "op_missing" }));

    await expectApiError(
      () => asUnsynced.query(api.opportunities.get, { opportunityId }),
      "not_synced",
    );
  });

  test("rejects a deactivated reader", async () => {
    const t = convexTest(schema, modules);
    const { asCompany, opportunityId, membership } = await seedOpportunity(t, {
      subject: "op_owner",
    });
    await t.run(async (ctx) => await ctx.db.patch("users", membership.userId, { isActive: false }));

    await expectApiError(
      () => asCompany.query(api.opportunities.get, { opportunityId }),
      "account_deactivated",
    );
  });

  test("lets a creator read the complete open opportunity", async () => {
    const t = convexTest(schema, modules);
    const { opportunityId } = await seedOpportunity(t, { subject: "op_owner" });
    const asCreator = await seedUser(t, { subject: "op_creator" });

    const result = await asCreator.query(api.opportunities.get, { opportunityId });
    const stored = await t.run(async (ctx) => await ctx.db.get("opportunities", opportunityId));

    expect(result).toEqual(stored);
  });
});
