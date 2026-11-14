/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "../_generated/api";
import schema from "../schema";
import { expectApiError, seedCreatorId, seedOperator, seedUser } from "./helpers";

const modules = import.meta.glob("../**/*.ts");

describe("authorize.creator", () => {
  test("resolves a signed-in creator to their own creator profile", async () => {
    const t = convexTest(schema, modules);
    const creatorId = await seedCreatorId(t, "authorize_creator");
    const asCreator = await seedUser(t, { subject: "authorize_creator" });

    const caller = await asCreator.query(internal.authorize.creator, {});

    expect(caller.creatorId).toBe(creatorId);
    expect(caller.user.workosId).toBe("authorize_creator");
  });

  test("refuses a company user", async () => {
    const t = convexTest(schema, modules);
    const asCompany = await seedUser(t, {
      subject: "authorize_company",
      org: { id: "org_acme", role: "admin" },
    });

    await expectApiError(() => asCompany.query(internal.authorize.creator, {}), "forbidden");
  });

  test("refuses an operator", async () => {
    const t = convexTest(schema, modules);
    const asOperator = await seedOperator(t, "authorize_operator");

    await expectApiError(() => asOperator.query(internal.authorize.creator, {}), "forbidden");
  });

  test("refuses a caller who is not signed in", async () => {
    const t = convexTest(schema, modules);

    await expectApiError(() => t.query(internal.authorize.creator, {}), "not_authenticated");
  });
});
