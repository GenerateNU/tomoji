/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import type { Id } from "../../_generated/dataModel";
import { getCompanyByWorkosId } from "../../models/companies";
import { getCompanyUser, listCompanyUsers, requireMembership } from "../../models/companyUsers";
import { getUserByWorkosId, removeMembership } from "../../models/users";
import schema from "../../schema";
import { expectApiError, seedUser, type TestConvex } from "../helpers";

const modules = import.meta.glob("../../**/*.ts");

async function idsFor(t: TestConvex, subject: string, orgId: string) {
  return await t.run(async (ctx) => {
    const user = await getUserByWorkosId(ctx, subject);
    if (user === null) throw new Error(`expected seeded user ${subject}`);
    const company = await getCompanyByWorkosId(ctx, orgId);
    if (company === null) throw new Error(`expected seeded company ${orgId}`);
    return { userId: user._id, companyId: company._id };
  });
}

async function companyIdFor(t: TestConvex, orgId: string) {
  return await t.run(async (ctx) => {
    const company = await getCompanyByWorkosId(ctx, orgId);
    if (company === null) throw new Error(`expected seeded company ${orgId}`);
    return company._id;
  });
}

/** Reads one page the way the route does: a fresh transaction per page. */
async function listPage(
  t: TestConvex,
  companyId: Id<"companies">,
  cursor: string | null = null,
  numItems = 10,
) {
  return await t.run(async (ctx) => await listCompanyUsers(ctx, companyId, { cursor, numItems }));
}

describe("getCompanyUser", () => {
  test("returns the membership row for a member", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "cu1", org: { id: "org_acme" } });
    const { userId, companyId } = await idsFor(t, "cu1", "org_acme");

    const membership = await t.run(async (ctx) => await getCompanyUser(ctx, userId, companyId));

    expect(membership?.userId).toBe(userId);
    expect(membership?.companyId).toBe(companyId);
    expect(membership?.role).toBe("member");
  });

  test("returns null when the user has no row for that company", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "cu2", org: { id: "org_acme" } });
    await seedUser(t, { subject: "cu3", org: { id: "org_other" } });
    const { userId } = await idsFor(t, "cu2", "org_acme");
    const { companyId: otherCompanyId } = await idsFor(t, "cu3", "org_other");

    const membership = await t.run(
      async (ctx) => await getCompanyUser(ctx, userId, otherCompanyId),
    );

    expect(membership).toBeNull();
  });

  test("returns null after the membership is removed", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "cu4", org: { id: "org_acme" } });
    const { userId, companyId } = await idsFor(t, "cu4", "org_acme");
    await t.run(
      async (ctx) =>
        await removeMembership(ctx, { workosUserId: "cu4", organizationId: "org_acme" }),
    );

    const membership = await t.run(async (ctx) => await getCompanyUser(ctx, userId, companyId));

    expect(membership).toBeNull();
  });

  test("scopes the lookup to the requested company for a user in two orgs", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "cu5", org: { id: "org_acme" } });
    await seedUser(t, { subject: "cu5", org: { id: "org_other" } });
    const { userId } = await idsFor(t, "cu5", "org_acme");
    const { companyId: otherCompanyId } = await idsFor(t, "cu5", "org_other");

    const membership = await t.run(
      async (ctx) => await getCompanyUser(ctx, userId, otherCompanyId),
    );

    expect(membership?.companyId).toBe(otherCompanyId);
  });
});

describe("requireMembership", () => {
  test("returns the membership that proves access to the org", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "cu6", org: { id: "org_acme", role: "admin" } });
    const { userId, companyId } = await idsFor(t, "cu6", "org_acme");

    const membership = await t.run(async (ctx) => await requireMembership(ctx, userId, "org_acme"));
    const expected = await t.run(async (ctx) => await getCompanyUser(ctx, userId, companyId));

    expect(membership.companyId).toBe(companyId);
    expect(membership.role).toBe("admin");
    expect(membership._id).toBe(expected?._id);
  });

  test("rejects an org whose company row has not synced", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "cu7" });
    const user = await t.run(async (ctx) => await getUserByWorkosId(ctx, "cu7"));

    await expectApiError(
      () => t.run(async (ctx) => await requireMembership(ctx, user!._id, "org_ghost")),
      "not_synced",
    );
  });

  test("rejects a user who is not a member of the org", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "cu8", org: { id: "org_acme" } });
    await seedUser(t, { subject: "cu9", org: { id: "org_other" } });
    const { userId } = await idsFor(t, "cu8", "org_acme");

    await expectApiError(
      () => t.run(async (ctx) => await requireMembership(ctx, userId, "org_other")),
      "forbidden",
    );
  });

  test("returns the org-specific membership for a user in two orgs", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "cu10", org: { id: "org_acme", role: "member" } });
    await seedUser(t, { subject: "cu10", org: { id: "org_other", role: "admin" } });
    const { userId } = await idsFor(t, "cu10", "org_other");

    const membership = await t.run(
      async (ctx) => await requireMembership(ctx, userId, "org_other"),
    );

    expect(membership.role).toBe("admin");
  });
});

describe("listCompanyUsers", () => {
  test("returns only that company's members", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "cu11", email: "a@acme.com", org: { id: "org_acme" } });
    await seedUser(t, { subject: "cu12", email: "b@acme.com", org: { id: "org_acme" } });
    await seedUser(t, { subject: "cu13", email: "x@other.com", org: { id: "org_other" } });

    const { page } = await listPage(t, await companyIdFor(t, "org_acme"));

    expect(page.map((m) => m.email).sort()).toEqual(["a@acme.com", "b@acme.com"]);
  });

  test("joins each membership with its user and keeps the company role", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, {
      subject: "cu14",
      email: "admin@acme.com",
      org: { id: "org_acme", role: "admin" },
    });
    const { userId, companyId } = await idsFor(t, "cu14", "org_acme");
    const membership = await t.run(async (ctx) => await getCompanyUser(ctx, userId, companyId));

    const { page } = await listPage(t, companyId);

    // Exact shape: proves `workosId`, `isActive` and the account-level role
    // are not leaked along with the membership.
    expect(page).toEqual([
      {
        membershipId: membership!._id,
        userId,
        role: "admin",
        name: "admin@acme.com", // upsertUser falls back to email when no name is given
        email: "admin@acme.com",
      },
    ]);
  });

  test("returns an empty page for a company with no members", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "cu15", org: { id: "org_acme" } });
    const { companyId } = await idsFor(t, "cu15", "org_acme");
    await t.run(
      async (ctx) =>
        await removeMembership(ctx, { workosUserId: "cu15", organizationId: "org_acme" }),
    );

    const result = await listPage(t, companyId);

    expect(result.page).toEqual([]);
    expect(result.isDone).toBe(true);
  });

  test("pages through every member", async () => {
    const t = convexTest(schema, modules);
    for (const n of [16, 17, 18]) {
      await seedUser(t, { subject: `cu${n}`, org: { id: "org_page" } });
    }
    const companyId = await companyIdFor(t, "org_page");

    const first = await listPage(t, companyId, null, 2);
    const second = await listPage(t, companyId, first.continueCursor, 2);

    expect(first.page).toHaveLength(2);
    expect(first.isDone).toBe(false);
    expect(second.page).toHaveLength(1);
    expect(second.isDone).toBe(true);
    expect(new Set([...first.page, ...second.page].map((m) => m.userId)).size).toBe(3);
  });

  test("skips a membership whose user row no longer exists and logs it", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "cu19", email: "kept@acme.com", org: { id: "org_acme" } });
    await seedUser(t, { subject: "cu20", org: { id: "org_acme" } });
    const { userId: deletedId, companyId } = await idsFor(t, "cu20", "org_acme");
    await t.run(async (ctx) => await ctx.db.delete(deletedId));
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    const { page } = await listPage(t, companyId);

    expect(page.map((m) => m.email)).toEqual(["kept@acme.com"]);
    // Pins the log: it is the only signal that a dangling row was skipped.
    expect(logged).toHaveBeenCalledOnce();
    logged.mockRestore();
  });

  test("still lists a deactivated member", async () => {
    // Pins current behavior. Flip this if deactivated members should be hidden.
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "cu21", org: { id: "org_acme" } });
    const { userId, companyId } = await idsFor(t, "cu21", "org_acme");
    await t.run(async (ctx) => await ctx.db.patch(userId, { isActive: false }));

    const { page } = await listPage(t, companyId);

    expect(page.map((m) => m.userId)).toEqual([userId]);
  });
});
