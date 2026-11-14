/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import schema from "../schema";
import { expectApiError, seedCreatorId, seedOperator, seedUser, seedXAccount } from "./helpers";

const modules = import.meta.glob("../**/*.ts");

describe("xAccounts.me", () => {
  test("returns only the caller's allowlisted account metadata", async () => {
    const t = convexTest(schema, modules);
    const { asCreator, account } = await seedXAccount(t, "x_me");
    await seedXAccount(t, "x_other", { xUserId: "987654321", username: "grace" });
    expect(await asCreator.query(api.xAccounts.me, {})).toEqual(account);
  });

  test("returns null when the creator has no linked account", async () => {
    const t = convexTest(schema, modules);
    const asCreator = await seedUser(t, { subject: "x_me_missing" });
    expect(await asCreator.query(api.xAccounts.me, {})).toBeNull();
  });

  test("rejects a signed-out caller", async () => {
    const t = convexTest(schema, modules);
    await expectApiError(() => t.query(api.xAccounts.me, {}), "not_authenticated");
  });

  test("rejects a company caller", async () => {
    const t = convexTest(schema, modules);
    const asCompany = await seedUser(t, { subject: "x_company", org: { id: "org_x" } });
    await expectApiError(() => asCompany.query(api.xAccounts.me, {}), "forbidden");
  });

  test("rejects an operator caller", async () => {
    const t = convexTest(schema, modules);
    const asOperator = await seedOperator(t, "x_operator");
    await expectApiError(() => asOperator.query(api.xAccounts.me, {}), "forbidden");
  });

  test("rejects an inactive creator", async () => {
    const t = convexTest(schema, modules);
    const { asCreator, creatorId } = await seedXAccount(t, "x_inactive");
    await t.run(async (ctx) => {
      const creator = await ctx.db.get("creators", creatorId);
      if (creator === null) throw new Error("expected seeded creator");
      await ctx.db.patch("users", creator.userId, { isActive: false });
    });
    await expectApiError(() => asCreator.query(api.xAccounts.me, {}), "account_deactivated");
  });

  test("reports missing creator data instead of returning a misleading disconnected state", async () => {
    const t = convexTest(schema, modules);
    const creatorId = await seedCreatorId(t, "x_missing_creator");
    const asCreator = await seedUser(t, { subject: "x_missing_creator" });
    await t.run(async (ctx) => await ctx.db.delete("creators", creatorId));
    await expectApiError(() => asCreator.query(api.xAccounts.me, {}), "not_found");
  });
});
