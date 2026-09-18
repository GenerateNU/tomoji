/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { companyByWorkosId } from "../../models/companies";
import { getByUserIdAndCompanyId, requireMembership } from "../../models/companyUsers";
import { byWorkosId, removeMembership } from "../../models/users";
import schema from "../../schema";
import { expectApiError, seedUser, type TestConvex } from "../helpers";

const modules = import.meta.glob("../../**/*.ts");

async function idsFor(t: TestConvex, subject: string, orgId: string) {
  return await t.run(async (ctx) => {
    const user = await byWorkosId(ctx, subject);
    const company = await companyByWorkosId(ctx, orgId);
    return { userId: user!._id, companyId: company!._id };
  });
}

describe("getByUserIdAndCompanyId", () => {
  test("returns the membership row for a member", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "cu1", org: { id: "org_acme" } });
    const { userId, companyId } = await idsFor(t, "cu1", "org_acme");

    const membership = await t.run(
      async (ctx) => await getByUserIdAndCompanyId(ctx, userId, companyId),
    );

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
      async (ctx) => await getByUserIdAndCompanyId(ctx, userId, otherCompanyId),
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

    const membership = await t.run(
      async (ctx) => await getByUserIdAndCompanyId(ctx, userId, companyId),
    );

    expect(membership).toBeNull();
  });

  test("scopes the lookup to the requested company for a user in two orgs", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "cu5", org: { id: "org_acme" } });
    await seedUser(t, { subject: "cu5", org: { id: "org_other" } });
    const { userId } = await idsFor(t, "cu5", "org_acme");
    const { companyId: otherCompanyId } = await idsFor(t, "cu5", "org_other");

    const membership = await t.run(
      async (ctx) => await getByUserIdAndCompanyId(ctx, userId, otherCompanyId),
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
    const expected = await t.run(
      async (ctx) => await getByUserIdAndCompanyId(ctx, userId, companyId),
    );

    expect(membership.companyId).toBe(companyId);
    expect(membership.role).toBe("admin");
    expect(membership._id).toBe(expected?._id);
  });

  test("rejects an org whose company row has not synced", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "cu7" });
    const user = await t.run(async (ctx) => await byWorkosId(ctx, "cu7"));

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
