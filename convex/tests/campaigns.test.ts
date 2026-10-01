/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import type { FunctionArgs } from "convex/server";
import { describe, expect, test, vi } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { getCompanyByWorkosId } from "../models/companies";
import { getCompanyUser } from "../models/companyUsers";
import { getUserByWorkosId, upsertUser } from "../models/users";
import schema from "../schema";
import { expectApiError, seedOperator, seedUser, workosIdentity, type TestConvex } from "./helpers";

const modules = import.meta.glob("../**/*.ts");

const HOUR = 60 * 60 * 1000;
const firstPage = { paginationOpts: { cursor: null, numItems: 10 } };
type CreateArgs = FunctionArgs<typeof api.campaigns.create>;

function createArgs(overrides: Partial<CreateArgs> = {}): CreateArgs {
  return {
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

async function seedOrphanedCompanyUser(t: TestConvex, subject: string, orgId: string) {
  await t.run(async (ctx) => {
    await upsertUser(ctx, {
      workosId: subject,
      email: `${subject}@example.com`,
      firstName: "Test",
    });
    const user = await getUserByWorkosId(ctx, subject);
    await ctx.db.patch("users", user!._id, { role: "company" });
  });
  return t.withIdentity(workosIdentity({ subject, org_id: orgId }));
}

describe("campaigns.get", () => {
  test.each(["admin", "member"] as const)(
    "lets a company %s read a campaign created by a teammate",
    async (role) => {
      const t = convexTest(schema, modules);
      const asAuthor = await seedUser(t, { subject: "cg-author", org: { id: "org_acme" } });
      const asTeammate = await seedUser(t, {
        subject: "cg-teammate",
        org: { id: "org_acme", role },
      });
      const campaignId = await asAuthor.mutation(
        api.campaigns.create,
        createArgs({ endsAt: Date.now() + 2 * HOUR }),
      );

      const campaign = await asTeammate.query(api.campaigns.get, { campaignId });
      const stored = await t.run(async (ctx) => await ctx.db.get("campaigns", campaignId));

      expect(campaign).toEqual(stored);
    },
  );

  test("rejects access to another company's campaign", async () => {
    const t = convexTest(schema, modules);
    const asOwner = await seedUser(t, { subject: "cg-owner", org: { id: "org_acme" } });
    const asOther = await seedUser(t, { subject: "cg-other", org: { id: "org_other" } });
    const campaignId = await asOwner.mutation(api.campaigns.create, createArgs());

    await expectApiError(() => asOther.query(api.campaigns.get, { campaignId }), "not_found");
  });

  test("rejects a signed-out caller", async () => {
    const t = convexTest(schema, modules);
    const asOwner = await seedUser(t, { subject: "cg-owner", org: { id: "org_acme" } });
    const campaignId = await asOwner.mutation(api.campaigns.create, createArgs());

    await expectApiError(() => t.query(api.campaigns.get, { campaignId }), "not_authenticated");
  });

  test("rejects a creator", async () => {
    const t = convexTest(schema, modules);
    const asOwner = await seedUser(t, { subject: "cg-owner", org: { id: "org_acme" } });
    const asCreator = await seedUser(t, { subject: "cg-creator" });
    const campaignId = await asOwner.mutation(api.campaigns.create, createArgs());

    await expectApiError(() => asCreator.query(api.campaigns.get, { campaignId }), "forbidden");
  });

  test("rejects a caller whose token claims the campaign's org without membership", async () => {
    const t = convexTest(schema, modules);
    const asOwner = await seedUser(t, { subject: "cg-owner", org: { id: "org_acme" } });
    await seedUser(t, { subject: "cg-outsider", org: { id: "org_other" } });
    const campaignId = await asOwner.mutation(api.campaigns.create, createArgs());
    const asWrongOrg = t.withIdentity(
      workosIdentity({ subject: "cg-outsider", org_id: "org_acme" }),
    );

    await expectApiError(() => asWrongOrg.query(api.campaigns.get, { campaignId }), "forbidden");
  });
});

describe("campaigns.list", () => {
  test.each(["admin", "member"] as const)(
    "lets a company %s list and filter their teammates' campaigns",
    async (role) => {
      const t = convexTest(schema, modules);
      const asAuthor = await seedUser(t, { subject: "cl-author", org: { id: "org_acme" } });
      const asTeammate = await seedUser(t, {
        subject: "cl-teammate",
        org: { id: "org_acme", role },
      });
      const asOther = await seedUser(t, { subject: "cl-other", org: { id: "org_other" } });
      const openId = await asAuthor.mutation(api.campaigns.create, createArgs());
      await asOther.mutation(api.campaigns.create, createArgs());
      const draftId = await asAuthor.mutation(
        api.campaigns.create,
        createArgs({ status: "draft" }),
      );

      const all = await asTeammate.query(api.campaigns.list, firstPage);
      const open = await asTeammate.query(api.campaigns.list, { ...firstPage, status: "open" });

      expect(all.page.map((campaign) => campaign._id)).toEqual([draftId, openId]);
      expect(all.isDone).toBe(true);
      expect(open.page.map((campaign) => campaign._id)).toEqual([openId]);
    },
  );

  test("accepts a continuation cursor for the next page", async () => {
    const t = convexTest(schema, modules);
    const asMember = await seedUser(t, { subject: "cl-pages", org: { id: "org_acme" } });
    const olderId = await asMember.mutation(api.campaigns.create, createArgs());
    const newerId = await asMember.mutation(api.campaigns.create, createArgs());

    const first = await asMember.query(api.campaigns.list, {
      paginationOpts: { cursor: null, numItems: 1 },
    });
    const second = await asMember.query(api.campaigns.list, {
      paginationOpts: { cursor: first.continueCursor, numItems: 1 },
    });

    expect(first.page.map((campaign) => campaign._id)).toEqual([newerId]);
    expect(first.isDone).toBe(false);
    expect(second.page.map((campaign) => campaign._id)).toEqual([olderId]);
    expect(second.isDone).toBe(true);
  });

  test("rejects a client-supplied company filter", async () => {
    const t = convexTest(schema, modules);
    const asMember = await seedUser(t, { subject: "cl-member", org: { id: "org_acme" } });
    await seedUser(t, { subject: "cl-other", org: { id: "org_other" } });
    const company = await t.run(async (ctx) => await getCompanyByWorkosId(ctx, "org_other"));
    const args = { ...firstPage, companyId: company!._id };

    await expect(asMember.query(api.campaigns.list, args)).rejects.toThrow(
      "Unexpected field `companyId`",
    );
  });

  test("rejects an invalid status filter", async () => {
    const t = convexTest(schema, modules);
    const asMember = await seedUser(t, { subject: "cl-status", org: { id: "org_acme" } });
    const args = { ...firstPage, status: "archived" };
    // @ts-expect-error Clients can send invalid statuses despite the generated argument types.
    const result = asMember.query(api.campaigns.list, args);

    await expect(result).rejects.toThrow("Validator error");
  });

  test("rejects a signed-out caller", async () => {
    const t = convexTest(schema, modules);

    await expectApiError(() => t.query(api.campaigns.list, firstPage), "not_authenticated");
  });

  test("rejects a creator", async () => {
    const t = convexTest(schema, modules);
    const asCreator = await seedUser(t, { subject: "cl-creator" });

    await expectApiError(() => asCreator.query(api.campaigns.list, firstPage), "forbidden");
  });

  test("rejects a company caller acting on an org they are not a member of", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "cl-outsider", org: { id: "org_acme" } });
    await seedUser(t, { subject: "cl-insider", org: { id: "org_other" } });
    const asWrongOrg = t.withIdentity(
      workosIdentity({ subject: "cl-outsider", org_id: "org_other" }),
    );

    await expectApiError(() => asWrongOrg.query(api.campaigns.list, firstPage), "forbidden");
  });
});

describe("campaigns.update", () => {
  test.each(["admin", "member"] as const)(
    "lets a company %s update a teammate's campaign",
    async (role) => {
      const t = convexTest(schema, modules);
      const asAuthor = await seedUser(t, { subject: "cu-author", org: { id: "org_acme" } });
      const asTeammate = await seedUser(t, {
        subject: "cu-teammate",
        org: { id: "org_acme", role },
      });
      const campaignId = await asAuthor.mutation(api.campaigns.create, createArgs());
      const before = await t.run(async (ctx) => await ctx.db.get("campaigns", campaignId));

      const result = await asTeammate.mutation(api.campaigns.update, {
        campaignId,
        title: "  Revised launch  ",
        budgetCents: 0,
      });

      expect(result).toBeNull();
      expect(await t.run(async (ctx) => await ctx.db.get("campaigns", campaignId))).toEqual({
        ...before,
        title: "Revised launch",
        budgetCents: 0,
      });
    },
  );

  test("rejects another company's campaign without modifying it", async () => {
    const t = convexTest(schema, modules);
    const asOwner = await seedUser(t, { subject: "cu-owner", org: { id: "org_acme" } });
    const asOther = await seedUser(t, { subject: "cu-other", org: { id: "org_other" } });
    const campaignId = await asOwner.mutation(api.campaigns.create, createArgs());
    const before = await t.run(async (ctx) => await ctx.db.get("campaigns", campaignId));

    await expectApiError(
      () => asOther.mutation(api.campaigns.update, { campaignId, title: "Changed" }),
      "not_found",
    );
    expect(await t.run(async (ctx) => await ctx.db.get("campaigns", campaignId))).toEqual(before);
  });

  test.each(["companyId", "createdBy", "status"] as const)(
    "rejects changes to %s without applying any edits",
    async (field) => {
      const t = convexTest(schema, modules);
      const asMember = await seedUser(t, { subject: "cu-member", org: { id: "org_acme" } });
      await seedUser(t, { subject: "cu-other", org: { id: "org_other" } });
      const campaignId = await asMember.mutation(api.campaigns.create, createArgs());
      const before = await t.run(async (ctx) => await ctx.db.get("campaigns", campaignId));
      const forbiddenFields = await t.run(async (ctx) => {
        const user = await getUserByWorkosId(ctx, "cu-other");
        const company = await getCompanyByWorkosId(ctx, "org_other");
        const membership = await getCompanyUser(ctx, user!._id, company!._id);
        return { companyId: company!._id, createdBy: membership!._id, status: "closed" };
      });
      const args = { campaignId, title: "Changed", [field]: forbiddenFields[field] };

      await expect(asMember.mutation(api.campaigns.update, args)).rejects.toThrow(
        `Unexpected field \`${field}\``,
      );
      expect(await t.run(async (ctx) => await ctx.db.get("campaigns", campaignId))).toEqual(before);
    },
  );

  test("accepts null to remove the optional end date", async () => {
    const t = convexTest(schema, modules);
    const asMember = await seedUser(t, { subject: "cu-clear", org: { id: "org_acme" } });
    const campaignId = await asMember.mutation(
      api.campaigns.create,
      createArgs({ endsAt: Date.now() + 2 * HOUR }),
    );

    await asMember.mutation(api.campaigns.update, { campaignId, endsAt: null });

    const stored = await t.run(async (ctx) => await ctx.db.get("campaigns", campaignId));
    expect(stored).not.toHaveProperty("endsAt");
  });

  test("rejects a signed-out caller", async () => {
    const t = convexTest(schema, modules);
    const asOwner = await seedUser(t, { subject: "cu-owner", org: { id: "org_acme" } });
    const campaignId = await asOwner.mutation(api.campaigns.create, createArgs());

    await expectApiError(
      () => t.mutation(api.campaigns.update, { campaignId, title: "Changed" }),
      "not_authenticated",
    );
  });

  test("rejects a creator", async () => {
    const t = convexTest(schema, modules);
    const asOwner = await seedUser(t, { subject: "cu-owner", org: { id: "org_acme" } });
    const asCreator = await seedUser(t, { subject: "cu-creator" });
    const campaignId = await asOwner.mutation(api.campaigns.create, createArgs());

    await expectApiError(
      () => asCreator.mutation(api.campaigns.update, { campaignId, title: "Changed" }),
      "forbidden",
    );
  });

  test("rejects a caller claiming the owner's org without membership", async () => {
    const t = convexTest(schema, modules);
    const asOwner = await seedUser(t, { subject: "cu-owner", org: { id: "org_acme" } });
    await seedUser(t, { subject: "cu-outsider", org: { id: "org_other" } });
    const campaignId = await asOwner.mutation(api.campaigns.create, createArgs());
    const asWrongOrg = t.withIdentity(
      workosIdentity({ subject: "cu-outsider", org_id: "org_acme" }),
    );

    await expectApiError(
      () => asWrongOrg.mutation(api.campaigns.update, { campaignId, title: "Changed" }),
      "forbidden",
    );
  });
});

describe("campaigns.remove", () => {
  test.each(["admin", "member"] as const)(
    "lets a company %s remove a teammate's empty draft",
    async (role) => {
      const t = convexTest(schema, modules);
      const asAuthor = await seedUser(t, { subject: "cr-author", org: { id: "org_acme" } });
      const asTeammate = await seedUser(t, {
        subject: "cr-teammate",
        org: { id: "org_acme", role },
      });
      const campaignId = await asAuthor.mutation(
        api.campaigns.create,
        createArgs({ status: "draft" }),
      );

      const result = await asTeammate.mutation(api.campaigns.remove, { campaignId });

      expect(result).toBeNull();
      expect(await t.run(async (ctx) => ctx.db.get("campaigns", campaignId))).toBeNull();
    },
  );

  test("rejects another company's draft without deleting it", async () => {
    const t = convexTest(schema, modules);
    const asOwner = await seedUser(t, { subject: "cr-owner", org: { id: "org_acme" } });
    const asOther = await seedUser(t, { subject: "cr-other", org: { id: "org_other" } });
    const campaignId = await asOwner.mutation(
      api.campaigns.create,
      createArgs({ status: "draft" }),
    );
    const before = await t.run(async (ctx) => ctx.db.get("campaigns", campaignId));

    await expectApiError(() => asOther.mutation(api.campaigns.remove, { campaignId }), "not_found");

    expect(await t.run(async (ctx) => ctx.db.get("campaigns", campaignId))).toEqual(before);
  });

  test("rejects a client-supplied company identity", async () => {
    const t = convexTest(schema, modules);
    const asOwner = await seedUser(t, { subject: "cr-owner", org: { id: "org_acme" } });
    const asOther = await seedUser(t, { subject: "cr-other", org: { id: "org_other" } });
    const campaignId = await asOwner.mutation(
      api.campaigns.create,
      createArgs({ status: "draft" }),
    );
    const campaign = await t.run(async (ctx) => ctx.db.get("campaigns", campaignId));
    const args = { campaignId, companyId: campaign!.companyId };

    await expect(asOther.mutation(api.campaigns.remove, args)).rejects.toThrow(
      "Unexpected field `companyId`",
    );
    expect(await t.run(async (ctx) => ctx.db.get("campaigns", campaignId))).toEqual(campaign);
  });

  test("rejects a signed-out caller", async () => {
    const t = convexTest(schema, modules);
    const asOwner = await seedUser(t, { subject: "cr-owner", org: { id: "org_acme" } });
    const campaignId = await asOwner.mutation(
      api.campaigns.create,
      createArgs({ status: "draft" }),
    );

    await expectApiError(
      () => t.mutation(api.campaigns.remove, { campaignId }),
      "not_authenticated",
    );
    expect(await t.run(async (ctx) => ctx.db.get("campaigns", campaignId))).not.toBeNull();
  });

  test("rejects a creator", async () => {
    const t = convexTest(schema, modules);
    const asOwner = await seedUser(t, { subject: "cr-owner", org: { id: "org_acme" } });
    const asCreator = await seedUser(t, { subject: "cr-creator" });
    const campaignId = await asOwner.mutation(
      api.campaigns.create,
      createArgs({ status: "draft" }),
    );

    await expectApiError(
      () => asCreator.mutation(api.campaigns.remove, { campaignId }),
      "forbidden",
    );
    expect(await t.run(async (ctx) => ctx.db.get("campaigns", campaignId))).not.toBeNull();
  });

  test("rejects a caller claiming the owner's org without membership", async () => {
    const t = convexTest(schema, modules);
    const asOwner = await seedUser(t, { subject: "cr-owner", org: { id: "org_acme" } });
    await seedUser(t, { subject: "cr-outsider", org: { id: "org_other" } });
    const campaignId = await asOwner.mutation(
      api.campaigns.create,
      createArgs({ status: "draft" }),
    );
    const asWrongOrg = t.withIdentity(
      workosIdentity({ subject: "cr-outsider", org_id: "org_acme" }),
    );

    await expectApiError(
      () => asWrongOrg.mutation(api.campaigns.remove, { campaignId }),
      "forbidden",
    );
    expect(await t.run(async (ctx) => ctx.db.get("campaigns", campaignId))).not.toBeNull();
  });
});

describe("campaigns.publish", () => {
  test.each(["admin", "member"] as const)(
    "lets a company %s publish a teammate's draft",
    async (role) => {
      const t = convexTest(schema, modules);
      const asAuthor = await seedUser(t, { subject: "cp-author", org: { id: "org_acme" } });
      const asTeammate = await seedUser(t, {
        subject: "cp-teammate",
        org: { id: "org_acme", role },
      });
      const campaignId = await asAuthor.mutation(
        api.campaigns.create,
        createArgs({ status: "draft" }),
      );
      const before = await t.run(async (ctx) => ctx.db.get("campaigns", campaignId));

      const result = await asTeammate.mutation(api.campaigns.publish, { campaignId });

      expect(result).toBeNull();
      expect(await t.run(async (ctx) => ctx.db.get("campaigns", campaignId))).toEqual({
        ...before,
        status: "open",
      });
    },
  );

  test("rejects another company's draft without changing it", async () => {
    const t = convexTest(schema, modules);
    const asOwner = await seedUser(t, { subject: "cp-owner", org: { id: "org_acme" } });
    const asOther = await seedUser(t, { subject: "cp-other", org: { id: "org_other" } });
    const campaignId = await asOwner.mutation(
      api.campaigns.create,
      createArgs({ status: "draft" }),
    );
    const before = await t.run(async (ctx) => ctx.db.get("campaigns", campaignId));

    await expectApiError(
      () => asOther.mutation(api.campaigns.publish, { campaignId }),
      "not_found",
    );
    expect(await t.run(async (ctx) => ctx.db.get("campaigns", campaignId))).toEqual(before);
  });

  test("rejects a client-supplied company identity", async () => {
    const t = convexTest(schema, modules);
    const asOwner = await seedUser(t, { subject: "cp-owner", org: { id: "org_acme" } });
    const asOther = await seedUser(t, { subject: "cp-other", org: { id: "org_other" } });
    const campaignId = await asOwner.mutation(
      api.campaigns.create,
      createArgs({ status: "draft" }),
    );
    const campaign = await t.run(async (ctx) => ctx.db.get("campaigns", campaignId));
    const args = { campaignId, companyId: campaign!.companyId };

    await expect(asOther.mutation(api.campaigns.publish, args)).rejects.toThrow(
      "Unexpected field `companyId`",
    );
    expect(await t.run(async (ctx) => ctx.db.get("campaigns", campaignId))).toEqual(campaign);
  });

  test("rejects a signed-out caller", async () => {
    const t = convexTest(schema, modules);
    const asOwner = await seedUser(t, { subject: "cp-owner", org: { id: "org_acme" } });
    const campaignId = await asOwner.mutation(
      api.campaigns.create,
      createArgs({ status: "draft" }),
    );

    await expectApiError(
      () => t.mutation(api.campaigns.publish, { campaignId }),
      "not_authenticated",
    );
    expect(await t.run(async (ctx) => ctx.db.get("campaigns", campaignId))).toHaveProperty(
      "status",
      "draft",
    );
  });

  test("rejects a creator", async () => {
    const t = convexTest(schema, modules);
    const asOwner = await seedUser(t, { subject: "cp-owner", org: { id: "org_acme" } });
    const asCreator = await seedUser(t, { subject: "cp-creator" });
    const campaignId = await asOwner.mutation(
      api.campaigns.create,
      createArgs({ status: "draft" }),
    );

    await expectApiError(
      () => asCreator.mutation(api.campaigns.publish, { campaignId }),
      "forbidden",
    );
    expect(await t.run(async (ctx) => ctx.db.get("campaigns", campaignId))).toHaveProperty(
      "status",
      "draft",
    );
  });

  test("rejects a caller claiming the owner's org without membership", async () => {
    const t = convexTest(schema, modules);
    const asOwner = await seedUser(t, { subject: "cp-owner", org: { id: "org_acme" } });
    await seedUser(t, { subject: "cp-outsider", org: { id: "org_other" } });
    const campaignId = await asOwner.mutation(
      api.campaigns.create,
      createArgs({ status: "draft" }),
    );
    const asWrongOrg = t.withIdentity(
      workosIdentity({ subject: "cp-outsider", org_id: "org_acme" }),
    );

    await expectApiError(
      () => asWrongOrg.mutation(api.campaigns.publish, { campaignId }),
      "forbidden",
    );
    expect(await t.run(async (ctx) => ctx.db.get("campaigns", campaignId))).toHaveProperty(
      "status",
      "draft",
    );
  });
});

describe("campaigns.pause", () => {
  test.each(["admin", "member"] as const)(
    "lets a company %s pause a teammate's open campaign",
    async (role) => {
      const t = convexTest(schema, modules);
      const asAuthor = await seedUser(t, { subject: "cpa-author", org: { id: "org_acme" } });
      const asTeammate = await seedUser(t, {
        subject: "cpa-teammate",
        org: { id: "org_acme", role },
      });
      const campaignId = await asAuthor.mutation(api.campaigns.create, createArgs());
      const before = await t.run(async (ctx) => ctx.db.get("campaigns", campaignId));

      const result = await asTeammate.mutation(api.campaigns.pause, { campaignId });

      expect(result).toBeNull();
      expect(await t.run(async (ctx) => ctx.db.get("campaigns", campaignId))).toEqual({
        ...before,
        status: "paused",
      });
    },
  );

  test("rejects another company's campaign without changing it", async () => {
    const t = convexTest(schema, modules);
    const asOwner = await seedUser(t, { subject: "cpa-owner", org: { id: "org_acme" } });
    const asOther = await seedUser(t, { subject: "cpa-other", org: { id: "org_other" } });
    const campaignId = await asOwner.mutation(api.campaigns.create, createArgs());
    const before = await t.run(async (ctx) => ctx.db.get("campaigns", campaignId));

    await expectApiError(() => asOther.mutation(api.campaigns.pause, { campaignId }), "not_found");
    expect(await t.run(async (ctx) => ctx.db.get("campaigns", campaignId))).toEqual(before);
  });

  test("rejects a client-supplied company identity", async () => {
    const t = convexTest(schema, modules);
    const asOwner = await seedUser(t, { subject: "cpa-owner", org: { id: "org_acme" } });
    const asOther = await seedUser(t, { subject: "cpa-other", org: { id: "org_other" } });
    const campaignId = await asOwner.mutation(api.campaigns.create, createArgs());
    const campaign = await t.run(async (ctx) => ctx.db.get("campaigns", campaignId));
    const args = { campaignId, companyId: campaign!.companyId };

    await expect(asOther.mutation(api.campaigns.pause, args)).rejects.toThrow(
      "Unexpected field `companyId`",
    );
    expect(await t.run(async (ctx) => ctx.db.get("campaigns", campaignId))).toEqual(campaign);
  });

  test("rejects a signed-out caller", async () => {
    const t = convexTest(schema, modules);
    const asOwner = await seedUser(t, { subject: "cpa-owner", org: { id: "org_acme" } });
    const campaignId = await asOwner.mutation(api.campaigns.create, createArgs());

    await expectApiError(
      () => t.mutation(api.campaigns.pause, { campaignId }),
      "not_authenticated",
    );
    expect(await t.run(async (ctx) => ctx.db.get("campaigns", campaignId))).toHaveProperty(
      "status",
      "open",
    );
  });

  test("rejects a creator", async () => {
    const t = convexTest(schema, modules);
    const asOwner = await seedUser(t, { subject: "cpa-owner", org: { id: "org_acme" } });
    const asCreator = await seedUser(t, { subject: "cpa-creator" });
    const campaignId = await asOwner.mutation(api.campaigns.create, createArgs());

    await expectApiError(
      () => asCreator.mutation(api.campaigns.pause, { campaignId }),
      "forbidden",
    );
    expect(await t.run(async (ctx) => ctx.db.get("campaigns", campaignId))).toHaveProperty(
      "status",
      "open",
    );
  });

  test("rejects a caller claiming the owner's org without membership", async () => {
    const t = convexTest(schema, modules);
    const asOwner = await seedUser(t, { subject: "cpa-owner", org: { id: "org_acme" } });
    await seedUser(t, { subject: "cpa-outsider", org: { id: "org_other" } });
    const campaignId = await asOwner.mutation(api.campaigns.create, createArgs());
    const asWrongOrg = t.withIdentity(
      workosIdentity({ subject: "cpa-outsider", org_id: "org_acme" }),
    );

    await expectApiError(
      () => asWrongOrg.mutation(api.campaigns.pause, { campaignId }),
      "forbidden",
    );
    expect(await t.run(async (ctx) => ctx.db.get("campaigns", campaignId))).toHaveProperty(
      "status",
      "open",
    );
  });
});

describe("campaigns.resume", () => {
  test.each(["admin", "member"] as const)(
    "lets a company %s resume a teammate's paused campaign",
    async (role) => {
      const t = convexTest(schema, modules);
      const asAuthor = await seedUser(t, { subject: "cre-author", org: { id: "org_acme" } });
      const asTeammate = await seedUser(t, {
        subject: "cre-teammate",
        org: { id: "org_acme", role },
      });
      const campaignId = await asAuthor.mutation(api.campaigns.create, createArgs());
      await asAuthor.mutation(api.campaigns.pause, { campaignId });
      const before = await t.run(async (ctx) => ctx.db.get("campaigns", campaignId));

      const result = await asTeammate.mutation(api.campaigns.resume, { campaignId });

      expect(result).toBeNull();
      expect(await t.run(async (ctx) => ctx.db.get("campaigns", campaignId))).toEqual({
        ...before,
        status: "open",
      });
    },
  );

  test("rejects another company's campaign without changing it", async () => {
    const t = convexTest(schema, modules);
    const asOwner = await seedUser(t, { subject: "cre-owner", org: { id: "org_acme" } });
    const asOther = await seedUser(t, { subject: "cre-other", org: { id: "org_other" } });
    const campaignId = await asOwner.mutation(api.campaigns.create, createArgs());
    await asOwner.mutation(api.campaigns.pause, { campaignId });
    const before = await t.run(async (ctx) => ctx.db.get("campaigns", campaignId));

    await expectApiError(() => asOther.mutation(api.campaigns.resume, { campaignId }), "not_found");
    expect(await t.run(async (ctx) => ctx.db.get("campaigns", campaignId))).toEqual(before);
  });

  test("rejects a client-supplied company identity", async () => {
    const t = convexTest(schema, modules);
    const asOwner = await seedUser(t, { subject: "cre-owner", org: { id: "org_acme" } });
    const asOther = await seedUser(t, { subject: "cre-other", org: { id: "org_other" } });
    const campaignId = await asOwner.mutation(api.campaigns.create, createArgs());
    await asOwner.mutation(api.campaigns.pause, { campaignId });
    const campaign = await t.run(async (ctx) => ctx.db.get("campaigns", campaignId));
    const args = { campaignId, companyId: campaign!.companyId };

    await expect(asOther.mutation(api.campaigns.resume, args)).rejects.toThrow(
      "Unexpected field `companyId`",
    );
    expect(await t.run(async (ctx) => ctx.db.get("campaigns", campaignId))).toEqual(campaign);
  });

  test("rejects a signed-out caller", async () => {
    const t = convexTest(schema, modules);
    const asOwner = await seedUser(t, { subject: "cre-owner", org: { id: "org_acme" } });
    const campaignId = await asOwner.mutation(api.campaigns.create, createArgs());
    await asOwner.mutation(api.campaigns.pause, { campaignId });

    await expectApiError(
      () => t.mutation(api.campaigns.resume, { campaignId }),
      "not_authenticated",
    );
    expect(await t.run(async (ctx) => ctx.db.get("campaigns", campaignId))).toHaveProperty(
      "status",
      "paused",
    );
  });

  test("rejects a creator", async () => {
    const t = convexTest(schema, modules);
    const asOwner = await seedUser(t, { subject: "cre-owner", org: { id: "org_acme" } });
    const asCreator = await seedUser(t, { subject: "cre-creator" });
    const campaignId = await asOwner.mutation(api.campaigns.create, createArgs());
    await asOwner.mutation(api.campaigns.pause, { campaignId });

    await expectApiError(
      () => asCreator.mutation(api.campaigns.resume, { campaignId }),
      "forbidden",
    );
    expect(await t.run(async (ctx) => ctx.db.get("campaigns", campaignId))).toHaveProperty(
      "status",
      "paused",
    );
  });

  test("rejects a caller claiming the owner's org without membership", async () => {
    const t = convexTest(schema, modules);
    const asOwner = await seedUser(t, { subject: "cre-owner", org: { id: "org_acme" } });
    await seedUser(t, { subject: "cre-outsider", org: { id: "org_other" } });
    const campaignId = await asOwner.mutation(api.campaigns.create, createArgs());
    await asOwner.mutation(api.campaigns.pause, { campaignId });
    const asWrongOrg = t.withIdentity(
      workosIdentity({ subject: "cre-outsider", org_id: "org_acme" }),
    );

    await expectApiError(
      () => asWrongOrg.mutation(api.campaigns.resume, { campaignId }),
      "forbidden",
    );
    expect(await t.run(async (ctx) => ctx.db.get("campaigns", campaignId))).toHaveProperty(
      "status",
      "paused",
    );
  });
});

describe("campaigns.close", () => {
  test.each(["admin", "member"] as const)(
    "lets a company %s close a teammate's campaign and safely repeat the request",
    async (role) => {
      const t = convexTest(schema, modules);
      const asAuthor = await seedUser(t, { subject: "ccl-author", org: { id: "org_acme" } });
      const asTeammate = await seedUser(t, {
        subject: "ccl-teammate",
        org: { id: "org_acme", role },
      });
      const campaignId = await asAuthor.mutation(api.campaigns.create, createArgs());
      const before = await t.run(async (ctx) => ctx.db.get("campaigns", campaignId));

      expect(await asTeammate.mutation(api.campaigns.close, { campaignId })).toBeNull();
      expect(await asTeammate.mutation(api.campaigns.close, { campaignId })).toBeNull();
      expect(await t.run(async (ctx) => ctx.db.get("campaigns", campaignId))).toEqual({
        ...before,
        status: "closed",
      });
    },
  );

  test("rejects another company's campaign without changing it", async () => {
    const t = convexTest(schema, modules);
    const asOwner = await seedUser(t, { subject: "ccl-owner", org: { id: "org_acme" } });
    const asOther = await seedUser(t, { subject: "ccl-other", org: { id: "org_other" } });
    const campaignId = await asOwner.mutation(api.campaigns.create, createArgs());
    const before = await t.run(async (ctx) => ctx.db.get("campaigns", campaignId));

    await expectApiError(() => asOther.mutation(api.campaigns.close, { campaignId }), "not_found");
    expect(await t.run(async (ctx) => ctx.db.get("campaigns", campaignId))).toEqual(before);
  });

  test("rejects a client-supplied company identity", async () => {
    const t = convexTest(schema, modules);
    const asOwner = await seedUser(t, { subject: "ccl-owner", org: { id: "org_acme" } });
    const asOther = await seedUser(t, { subject: "ccl-other", org: { id: "org_other" } });
    const campaignId = await asOwner.mutation(api.campaigns.create, createArgs());
    const campaign = await t.run(async (ctx) => ctx.db.get("campaigns", campaignId));
    const args = { campaignId, companyId: campaign!.companyId };

    await expect(asOther.mutation(api.campaigns.close, args)).rejects.toThrow(
      "Unexpected field `companyId`",
    );
    expect(await t.run(async (ctx) => ctx.db.get("campaigns", campaignId))).toEqual(campaign);
  });

  test("rejects a signed-out caller", async () => {
    const t = convexTest(schema, modules);
    const asOwner = await seedUser(t, { subject: "ccl-owner", org: { id: "org_acme" } });
    const campaignId = await asOwner.mutation(api.campaigns.create, createArgs());

    await expectApiError(
      () => t.mutation(api.campaigns.close, { campaignId }),
      "not_authenticated",
    );
    expect(await t.run(async (ctx) => ctx.db.get("campaigns", campaignId))).toHaveProperty(
      "status",
      "open",
    );
  });

  test("rejects a creator", async () => {
    const t = convexTest(schema, modules);
    const asOwner = await seedUser(t, { subject: "ccl-owner", org: { id: "org_acme" } });
    const asCreator = await seedUser(t, { subject: "ccl-creator" });
    const campaignId = await asOwner.mutation(api.campaigns.create, createArgs());

    await expectApiError(
      () => asCreator.mutation(api.campaigns.close, { campaignId }),
      "forbidden",
    );
    expect(await t.run(async (ctx) => ctx.db.get("campaigns", campaignId))).toHaveProperty(
      "status",
      "open",
    );
  });

  test("rejects a caller claiming the owner's org without membership", async () => {
    const t = convexTest(schema, modules);
    const asOwner = await seedUser(t, { subject: "ccl-owner", org: { id: "org_acme" } });
    await seedUser(t, { subject: "ccl-outsider", org: { id: "org_other" } });
    const campaignId = await asOwner.mutation(api.campaigns.create, createArgs());
    const asWrongOrg = t.withIdentity(
      workosIdentity({ subject: "ccl-outsider", org_id: "org_acme" }),
    );

    await expectApiError(
      () => asWrongOrg.mutation(api.campaigns.close, { campaignId }),
      "forbidden",
    );
    expect(await t.run(async (ctx) => ctx.db.get("campaigns", campaignId))).toHaveProperty(
      "status",
      "open",
    );
  });
});

describe("campaigns.closeExpired", () => {
  test("does not schedule more work when there are no expired campaigns", async () => {
    const t = convexTest(schema, modules);

    expect(await t.mutation(internal.campaigns.closeExpired, {})).toBeNull();

    expect(
      await t.run(async (ctx) => ctx.db.system.query("_scheduled_functions").collect()),
    ).toEqual([]);
  });

  test("drains a backlog and rechecks dates changed before the next batch", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_800_000_000_000);
    const t = convexTest(schema, modules);
    try {
      const asOwner = await seedUser(t, { subject: "ce-owner", org: { id: "org_acme" } });
      const campaignIds: Id<"campaigns">[] = [];
      for (let i = 0; i < 105; i++) {
        campaignIds.push(
          await asOwner.mutation(
            api.campaigns.create,
            createArgs({ startsAt: 0, endsAt: Date.now() - 1000 + i }),
          ),
        );
      }

      expect(await t.mutation(internal.campaigns.closeExpired, {})).toBeNull();
      const afterFirst = await t.run(async (ctx) =>
        Promise.all(campaignIds.map((id) => ctx.db.get("campaigns", id))),
      );
      expect(afterFirst.filter((campaign) => campaign?.status === "closed")).toHaveLength(50);
      expect(afterFirst.filter((campaign) => campaign?.status === "open")).toHaveLength(55);

      const extendedId = campaignIds[103];
      const clearedId = campaignIds[104];
      await asOwner.mutation(api.campaigns.update, {
        campaignId: extendedId,
        endsAt: Date.now() + HOUR,
      });
      await asOwner.mutation(api.campaigns.update, { campaignId: clearedId, endsAt: null });
      await t.finishAllScheduledFunctions(() => vi.runAllTimers());

      const after = await t.run(async (ctx) =>
        Promise.all(campaignIds.map((id) => ctx.db.get("campaigns", id))),
      );
      expect(after.filter((campaign) => campaign?.status === "closed")).toHaveLength(103);
      expect(after[103]).toMatchObject({ status: "open", endsAt: Date.now() + HOUR });
      expect(after[104]).toHaveProperty("status", "open");
      expect(after[104]).not.toHaveProperty("endsAt");
      const jobs = await t.run(async (ctx) =>
        ctx.db.system.query("_scheduled_functions").collect(),
      );
      expect(jobs).toHaveLength(2);
      expect(jobs.every((job) => job.state.kind === "success")).toBe(true);

      await t.mutation(internal.campaigns.closeExpired, {});
      expect(
        await t.run(async (ctx) => ctx.db.system.query("_scheduled_functions").collect()),
      ).toEqual(jobs);
    } finally {
      await t.finishAllScheduledFunctions(() => vi.runAllTimers());
      vi.useRealTimers();
    }
  });
});

describe("campaigns.create", () => {
  test.each([
    { role: "admin", status: "draft" },
    { role: "admin", status: "open" },
    { role: "member", status: "draft" },
    { role: "member", status: "open" },
  ] as const)("lets a company $role create a $status campaign", async ({ role, status }) => {
    const t = convexTest(schema, modules);
    const asMember = await seedUser(t, { subject: "cc1", org: { id: "org_acme", role } });
    const args = createArgs({ status });

    const id = await asMember.mutation(api.campaigns.create, args);
    const stored = await t.run(async (ctx) => await ctx.db.get("campaigns", id));

    expect(stored?.title).toBe(args.title);
    expect(stored?.description).toBe(args.description);
    expect(stored?.objective).toBe(args.objective);
    expect(stored?.product).toBe(args.product);
    expect(stored?.audience).toBe(args.audience);
    expect(stored?.budgetCents).toBe(args.budgetCents);
    expect(stored?.startsAt).toBe(args.startsAt);
    expect(stored?.status).toBe(args.status);
  });

  test("derives the company from the caller's membership, not the client", async () => {
    const t = convexTest(schema, modules);
    const asMember = await seedUser(t, { subject: "cc2", org: { id: "org_acme" } });
    await seedUser(t, { subject: "cc3", org: { id: "org_other" } });

    // companyId/createdBy aren't in the arg validator, so a client cannot
    // supply them — this pins that the route derives them server-side.
    const id = await asMember.mutation(api.campaigns.create, createArgs());
    const stored = await t.run(async (ctx) => await ctx.db.get("campaigns", id));
    const { companyId, membershipId } = await t.run(async (ctx) => {
      const user = await getUserByWorkosId(ctx, "cc2");
      const company = await getCompanyByWorkosId(ctx, "org_acme");
      const membership = await getCompanyUser(ctx, user!._id, company!._id);
      return { companyId: company!._id, membershipId: membership!._id };
    });

    expect(stored?.companyId).toBe(companyId);
    expect(stored?.createdBy).toBe(membershipId);
  });

  test.each(["companyId", "createdBy"] as const)(
    "rejects client-supplied %s without creating a campaign",
    async (field) => {
      const t = convexTest(schema, modules);
      const asMember = await seedUser(t, { subject: "cc-owner", org: { id: "org_acme" } });
      await seedUser(t, { subject: "cc-other", org: { id: "org_other" } });
      const otherOwner = await t.run(async (ctx) => {
        const user = await getUserByWorkosId(ctx, "cc-other");
        const company = await getCompanyByWorkosId(ctx, "org_other");
        const membership = await getCompanyUser(ctx, user!._id, company!._id);
        return { companyId: company!._id, createdBy: membership!._id };
      });
      const args = { ...createArgs(), [field]: otherOwner[field] };

      await expect(asMember.mutation(api.campaigns.create, args)).rejects.toThrow(
        `Unexpected field \`${field}\``,
      );
      expect(await t.run(async (ctx) => await ctx.db.query("campaigns").first())).toBeNull();
    },
  );

  test.each(["paused", "closed"] as const)(
    "rejects initial status %s at the argument boundary",
    async (status) => {
      const t = convexTest(schema, modules);
      const asMember = await seedUser(t, { subject: "cc-status", org: { id: "org_acme" } });
      const args = { ...createArgs(), status };
      // @ts-expect-error Clients can send invalid statuses despite the generated argument types.
      const result = asMember.mutation(api.campaigns.create, args);

      await expect(result).rejects.toThrow("Validator error");
      expect(await t.run(async (ctx) => await ctx.db.query("campaigns").first())).toBeNull();
    },
  );

  test("persists the optional campaign end time", async () => {
    const t = convexTest(schema, modules);
    const asMember = await seedUser(t, { subject: "cc4", org: { id: "org_acme" } });
    const args = createArgs({ endsAt: Date.now() + 2 * HOUR });

    const id = await asMember.mutation(api.campaigns.create, args);
    const stored = await t.run(async (ctx) => await ctx.db.get("campaigns", id));

    expect(stored?.endsAt).toBe(args.endsAt);
  });

  test("rejects a fractional budget without creating a campaign", async () => {
    const t = convexTest(schema, modules);
    const asMember = await seedUser(t, { subject: "cc6", org: { id: "org_acme" } });
    const args = createArgs({ budgetCents: 0.5 });

    await expectApiError(() => asMember.mutation(api.campaigns.create, args), "invalid_state");

    const campaigns = await t.run(async (ctx) => await ctx.db.query("campaigns").collect());
    expect(campaigns).toHaveLength(0);
  });

  test("rejects a signed-out caller", async () => {
    const t = convexTest(schema, modules);

    await expectApiError(() => t.mutation(api.campaigns.create, createArgs()), "not_authenticated");
  });

  test("rejects a creator", async () => {
    const t = convexTest(schema, modules);
    const asCreator = await seedUser(t, { subject: "cc7" });

    await expectApiError(() => asCreator.mutation(api.campaigns.create, createArgs()), "forbidden");
  });

  test("rejects an operator", async () => {
    const t = convexTest(schema, modules);
    const asOperator = await seedOperator(t, "cc8");

    await expectApiError(
      () => asOperator.mutation(api.campaigns.create, createArgs()),
      "forbidden",
    );
  });

  test("rejects a company caller whose org has not synced", async () => {
    const t = convexTest(schema, modules);
    const asOrphan = await seedOrphanedCompanyUser(t, "cc9", "org_ghost");

    await expectApiError(() => asOrphan.mutation(api.campaigns.create, createArgs()), "not_synced");
  });

  test("rejects a company caller acting on an org they are not a member of", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "cc10", org: { id: "org_acme" } });
    await seedUser(t, { subject: "cc11", org: { id: "org_other" } });
    const asWrongOrg = t.withIdentity(workosIdentity({ subject: "cc10", org_id: "org_other" }));

    await expectApiError(
      () => asWrongOrg.mutation(api.campaigns.create, createArgs()),
      "forbidden",
    );

    const campaigns = await t.run(async (ctx) => await ctx.db.query("campaigns").collect());
    expect(campaigns).toHaveLength(0);
  });

  test("rejects a company caller whose token carries no organization", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "cc12", org: { id: "org_acme" } });
    const asNoOrg = t.withIdentity(workosIdentity({ subject: "cc12" }));

    await expectApiError(
      () => asNoOrg.mutation(api.campaigns.create, createArgs()),
      "misconfigured",
    );
  });
});
