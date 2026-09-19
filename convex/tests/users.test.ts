/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import schema from "../schema";
import { expectApiError, seedOperator, seedUser, workosIdentity } from "./helpers";

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
    const asUser = await seedUser(t, { subject: "user_2", email: "dev@example.com" });

    const me = synced(await asUser.query(api.users.me, {}));

    expect(me.role).toBe("creator");
    expect(me.email).toBe("dev@example.com");
  });

  test("surfaces the org and company role for a company account", async () => {
    const t = convexTest(schema, modules);
    const asUser = await seedUser(t, { subject: "user_3", org: { id: "org_acme", role: "admin" } });

    const me = asCompany(await asUser.query(api.users.me, {}));

    expect(me.orgId).toBe("org_acme");
    expect(me.companyRole).toBe("admin");
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

  test("optionally filters users by role", async () => {
    const t = convexTest(schema, modules);
    const asOperator = await seedOperator(t, "filter_operator");
    await seedUser(t, { subject: "filter_creator" });
    await seedUser(t, { subject: "filter_company", org: { id: "org_filter" } });

    const result = await asOperator.query(api.users.list, {
      role: "creator",
      paginationOpts: { cursor: null, numItems: 10 },
    });

    expect(result.page.map((user) => user.workosId)).toEqual(["filter_creator"]);
    expect(result.isDone).toBe(true);
  });
});
