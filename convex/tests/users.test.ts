/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import { api } from "../_generated/api";
import { deactivateUser, getUserByWorkosId, removeMembership } from "../models/users";
import schema from "../schema";
import {
  expectApiError,
  requireSeededUser,
  seedOperator,
  seedUser,
  workosIdentity,
} from "./helpers";

const modules = import.meta.glob("../**/*.ts");

function synced<T extends { synced: boolean }>(me: T): Extract<T, { synced: true }> {
  if (!me.synced) throw new Error("expected the caller to be synced");
  return me as Extract<T, { synced: true }>;
}

function asCompany<T extends { synced: boolean }>(
  me: T,
): Extract<T, { synced: true; role: "company" }> {
  const s = synced(me);
  if (!("orgId" in s)) throw new Error("expected a company account");
  return s as unknown as Extract<T, { synced: true; role: "company" }>;
}

describe("users.me", () => {
  test.each([
    { firstName: "Ada", lastName: "" },
    { firstName: "Ada", lastName: "Lovelace" },
  ])("returns a synced user with separate name parts %j", async (names) => {
    const t = convexTest(schema, modules);
    const asUser = await seedUser(t, { subject: "user_names", ...names });
    const userId = await t.run(async (ctx) => {
      const user = await getUserByWorkosId(ctx, "user_names");
      if (user === null) throw new Error("expected seeded user");
      return user._id;
    });

    expect(await asUser.query(api.users.me, {})).toEqual({
      synced: true,
      userId,
      role: "creator",
      email: "user_names@example.com",
      ...names,
    });
  });

  test("rejects a signed-out caller", async () => {
    const t = convexTest(schema, modules);
    await expectApiError(() => t.query(api.users.me, {}), "not_authenticated");
  });

  test("reports synced: false before the webhook has landed", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity(workosIdentity({ subject: "user_1" }));

    expect(await asUser.query(api.users.me, {})).toEqual({ synced: false });
  });

  test("returns a creator once synced", async () => {
    const t = convexTest(schema, modules);
    const asUser = await seedUser(t, {
      subject: "user_2",
      email: "dev@example.com",
      firstName: "Ada",
      lastName: "Lovelace",
    });

    const me = synced(await asUser.query(api.users.me, {}));

    expect(me.role).toBe("creator");
    expect(me.email).toBe("dev@example.com");
    expect(me).not.toHaveProperty("name");
    expect(me.firstName).toBe("Ada");
    expect(me.lastName).toBe("Lovelace");
  });

  test("surfaces the org and company role for a company account", async () => {
    const t = convexTest(schema, modules);
    const asUser = await seedUser(t, { subject: "user_3", org: { id: "org_acme", role: "admin" } });

    const me = asCompany(await asUser.query(api.users.me, {}));

    expect(me.orgId).toBe("org_acme");
    expect(me.companyRole).toBe("admin");
  });

  test("rejects a deactivated account", async () => {
    const t = convexTest(schema, modules);
    const asUser = await seedUser(t, { subject: "me_deactivated" });
    await t.run(async (ctx) => await deactivateUser(ctx, "me_deactivated"));

    await expectApiError(() => asUser.query(api.users.me, {}), "account_deactivated");
  });

  test("rejects an account locked for a duplicate email", async () => {
    const t = convexTest(schema, modules);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await seedUser(t, { subject: "me_dup_owner", email: "me-dup@example.com" });
    const asDuplicate = await seedUser(t, {
      subject: "me_dup_claimant",
      email: "me-dup@example.com",
    });

    await expectApiError(() => asDuplicate.query(api.users.me, {}), "account_deactivated");
  });
});

describe("users.list", () => {
  test("rejects a signed-out caller", async () => {
    const t = convexTest(schema, modules);

    await expectApiError(
      () => t.query(api.users.list, { paginationOpts: { cursor: null, numItems: 10 } }),
      "not_authenticated",
    );
  });

  test("rejects a creator caller", async () => {
    const t = convexTest(schema, modules);
    const asCreator = await seedUser(t, { subject: "list_creator" });

    await expectApiError(
      () => asCreator.query(api.users.list, { paginationOpts: { cursor: null, numItems: 10 } }),
      "forbidden",
    );
  });

  test("rejects a company caller", async () => {
    const t = convexTest(schema, modules);
    const asCompany = await seedUser(t, {
      subject: "list_company",
      org: { id: "org_list" },
    });

    await expectApiError(
      () => asCompany.query(api.users.list, { paginationOpts: { cursor: null, numItems: 10 } }),
      "forbidden",
    );
  });

  test("lists users across cursor-based pages", async () => {
    const t = convexTest(schema, modules);
    const asOperator = await seedOperator(t, "list_operator");
    await seedUser(t, { subject: "list_creator_1" });
    await seedUser(t, { subject: "list_creator_2" });

    const firstPage = await asOperator.query(api.users.list, {
      paginationOpts: { cursor: null, numItems: 2 },
    });
    const secondPage = await asOperator.query(api.users.list, {
      paginationOpts: { cursor: firstPage.continueCursor, numItems: 2 },
    });

    expect(firstPage.page).toHaveLength(2);
    expect(firstPage.isDone).toBe(false);
    expect(secondPage.page).toHaveLength(1);
    expect(secondPage.isDone).toBe(true);
    expect([...firstPage.page, ...secondPage.page].map((user) => user.workosId).sort()).toEqual([
      "list_creator_1",
      "list_creator_2",
      "list_operator",
    ]);
  });

  test("excludes inactive accounts by default", async () => {
    const t = convexTest(schema, modules);
    const asOperator = await seedOperator(t, "active_default_operator");
    await seedUser(t, { subject: "active_default_creator" });
    await seedUser(t, { subject: "inactive_default_creator" });
    await t.run(async (ctx) => await deactivateUser(ctx, "inactive_default_creator"));

    const result = await asOperator.query(api.users.list, {
      paginationOpts: { cursor: null, numItems: 10 },
    });

    expect(result.page.map((user) => user.workosId).sort()).toEqual([
      "active_default_creator",
      "active_default_operator",
    ]);
  });

  test("includes inactive accounts when requested", async () => {
    const t = convexTest(schema, modules);
    const asOperator = await seedOperator(t, "include_inactive_operator");
    await seedUser(t, { subject: "include_inactive_creator" });
    await t.run(async (ctx) => await deactivateUser(ctx, "include_inactive_creator"));

    const result = await asOperator.query(api.users.list, {
      includeInactive: true,
      paginationOpts: { cursor: null, numItems: 10 },
    });

    expect(result.page.map((user) => user.workosId).sort()).toEqual([
      "include_inactive_creator",
      "include_inactive_operator",
    ]);
  });

  test("returns complete user documents from later pages using only the cursor", async () => {
    const t = convexTest(schema, modules);
    const asOperator = await seedOperator(t, "later_page_operator");
    await seedUser(t, {
      subject: "later_page_creator",
      email: "later-page@example.com",
    });

    const { continueCursor } = await asOperator.query(api.users.list, {
      paginationOpts: { cursor: null, numItems: 1 },
    });
    const secondPage = await asOperator.query(api.users.list, {
      paginationOpts: { cursor: continueCursor, numItems: 1 },
    });

    expect(secondPage.page).toEqual([
      expect.objectContaining({
        workosId: "later_page_creator",
        firstName: "Test",
        lastName: "",
        email: "later-page@example.com",
        role: "creator",
        isActive: true,
      }),
    ]);
    expect(secondPage.isDone).toBe(true);
  });

  test("optionally filters users by role", async () => {
    const t = convexTest(schema, modules);
    const asOperator = await seedOperator(t, "filter_operator");
    await seedUser(t, { subject: "filter_creator" });
    await seedUser(t, { subject: "filter_inactive_creator" });
    await t.run(async (ctx) => await deactivateUser(ctx, "filter_inactive_creator"));
    await seedUser(t, { subject: "filter_company", org: { id: "org_filter" } });

    const result = await asOperator.query(api.users.list, {
      role: "creator",
      paginationOpts: { cursor: null, numItems: 10 },
    });

    expect(result.page.map((user) => user.workosId)).toEqual(["filter_creator"]);
    expect(result.isDone).toBe(true);
  });

  test("includes inactive accounts within a role filter when requested", async () => {
    const t = convexTest(schema, modules);
    const asOperator = await seedOperator(t, "filter_inactive_operator");
    await seedUser(t, { subject: "filter_active_creator" });
    await seedUser(t, { subject: "filter_requested_inactive_creator" });
    await t.run(async (ctx) => await deactivateUser(ctx, "filter_requested_inactive_creator"));

    const result = await asOperator.query(api.users.list, {
      role: "creator",
      includeInactive: true,
      paginationOpts: { cursor: null, numItems: 10 },
    });

    expect(result.page.map((user) => user.workosId).sort()).toEqual([
      "filter_active_creator",
      "filter_requested_inactive_creator",
    ]);
  });
});

describe("users.list duplicate-email accounts", () => {
  test("excludes a duplicate-email account by default and includes it when requested", async () => {
    const t = convexTest(schema, modules);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const asOperator = await seedOperator(t, "dup_list_operator");
    await seedUser(t, {
      subject: "dup_list_owner",
      email: "dup-list@example.com",
    });
    await seedUser(t, {
      subject: "dup_list_claimant",
      email: "dup-list@example.com",
    });

    const byDefault = await asOperator.query(api.users.list, {
      paginationOpts: { cursor: null, numItems: 10 },
    });
    const withInactive = await asOperator.query(api.users.list, {
      includeInactive: true,
      paginationOpts: { cursor: null, numItems: 10 },
    });

    expect(byDefault.page.map((user) => user.workosId).sort()).toEqual([
      "dup_list_operator",
      "dup_list_owner",
    ]);
    expect(withInactive.page.map((user) => user.workosId).sort()).toEqual([
      "dup_list_claimant",
      "dup_list_operator",
      "dup_list_owner",
    ]);
  });
});

describe("users.setActive", () => {
  test("rejects a non-operator caller", async () => {
    const t = convexTest(schema, modules);
    const asCreator = await seedUser(t, { subject: "set_active_creator" });
    const userId = (await requireSeededUser(t, "set_active_creator"))._id;

    await expectApiError(
      () => asCreator.mutation(api.users.setActive, { userId, isActive: false }),
      "forbidden",
    );
  });

  test("lets an operator deactivate an account and records operator as the reason", async () => {
    const t = convexTest(schema, modules);
    const asOperator = await seedOperator(t, "set_active_operator");
    await seedUser(t, { subject: "set_active_target" });
    const userId = (await requireSeededUser(t, "set_active_target"))._id;

    const result = await asOperator.mutation(api.users.setActive, {
      userId,
      isActive: false,
    });

    expect(result).toMatchObject({
      _id: userId,
      isActive: false,
      deactivatedReason: "operator",
    });
    expect(await requireSeededUser(t, "set_active_target")).toMatchObject({
      isActive: false,
      deactivatedReason: "operator",
    });
  });

  test("rejects reactivating a company user with no active membership", async () => {
    const t = convexTest(schema, modules);
    const asOperator = await seedOperator(t, "no_membership_operator");
    await seedUser(t, {
      subject: "no_membership_target",
      org: { id: "org_acme" },
    });
    await t.run(async (ctx) => {
      await removeMembership(ctx, {
        workosUserId: "no_membership_target",
        organizationId: "org_acme",
      });
    });
    const userId = (await requireSeededUser(t, "no_membership_target"))._id;

    await expectApiError(
      () => asOperator.mutation(api.users.setActive, { userId, isActive: true }),
      "invalid_state",
      "no_active_membership",
    );
  });

  test("rejects reactivating a duplicate-email account while the email is taken", async () => {
    const t = convexTest(schema, modules);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const asOperator = await seedOperator(t, "email_in_use_operator");
    await seedUser(t, {
      subject: "email_in_use_owner",
      email: "in-use@example.com",
    });
    await seedUser(t, {
      subject: "email_in_use_claimant",
      email: "in-use@example.com",
    });
    const userId = (await requireSeededUser(t, "email_in_use_claimant"))._id;

    await expectApiError(
      () => asOperator.mutation(api.users.setActive, { userId, isActive: true }),
      "invalid_state",
      "email_in_use",
    );
  });

  test("reports not_found for a user ID that no longer exists", async () => {
    const t = convexTest(schema, modules);
    const asOperator = await seedOperator(t, "not_found_operator");
    await seedUser(t, { subject: "not_found_target" });
    const userId = (await requireSeededUser(t, "not_found_target"))._id;
    await t.run(async (ctx) => {
      const creator = await ctx.db
        .query("creators")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .unique();
      if (creator !== null) await ctx.db.delete("creators", creator._id);
      await ctx.db.delete("users", userId);
    });

    await expectApiError(
      () => asOperator.mutation(api.users.setActive, { userId, isActive: true }),
      "not_found",
    );
  });
});
