/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import type { FunctionArgs } from "convex/server";
import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
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
