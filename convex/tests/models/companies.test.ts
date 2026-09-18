/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { companyByWorkosId } from "../../models/companies";
import schema from "../../schema";
import { seedUser } from "../helpers";

const modules = import.meta.glob("../../**/*.ts");

describe("companyByWorkosId", () => {
  test("returns the company synced for the org", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "co1", org: { id: "org_acme", name: "Acme Inc" } });

    const company = await t.run(async (ctx) => await companyByWorkosId(ctx, "org_acme"));

    expect(company).not.toBeNull();
    expect(company?.workosId).toBe("org_acme");
    expect(company?.name).toBe("Acme Inc");
  });

  test("returns null for an org that has never synced", async () => {
    const t = convexTest(schema, modules);

    const company = await t.run(async (ctx) => await companyByWorkosId(ctx, "org_ghost"));

    expect(company).toBeNull();
  });

  test("matches on the workos id rather than returning any company", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "co2", org: { id: "org_acme" } });
    await seedUser(t, { subject: "co3", org: { id: "org_other" } });

    const company = await t.run(async (ctx) => await companyByWorkosId(ctx, "org_other"));

    expect(company?.workosId).toBe("org_other");
  });
});
