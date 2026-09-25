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
type CreateArgs = FunctionArgs<typeof api.campaigns.create>;

function createArgs(overrides: Partial<CreateArgs> = {}): CreateArgs {
  return {
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

async function seedOrphanedCompanyUser(t: TestConvex, subject: string, orgId: string) {
  await t.run(async (ctx) => {
    await upsertUser(ctx, { workosId: subject, email: `${subject}@example.com` });
    const user = await getUserByWorkosId(ctx, subject);
    await ctx.db.patch("users", user!._id, { role: "company" });
  });
  return t.withIdentity(workosIdentity({ subject, org_id: orgId }));
}

describe("campaigns.create", () => {
  test("creates a campaign for the caller's company and returns its id", async () => {
    const t = convexTest(schema, modules);
    const asMember = await seedUser(t, { subject: "cc1", org: { id: "org_acme" } });
    const args = createArgs();

    const id = await asMember.mutation(api.campaigns.create, args);
    const stored = await t.run(async (ctx) => await ctx.db.get("campaigns", id));

    expect(stored?.title).toBe(args.title);
    expect(stored?.description).toBe(args.description);
    expect(stored?.objective).toBe(args.objective);
    expect(stored?.product).toBe(args.product);
    expect(stored?.audience).toBe(args.audience);
    expect(stored?.budgetCents).toBe(args.budgetCents);
    expect(stored?.startsAt).toBe(args.startsAt);
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
