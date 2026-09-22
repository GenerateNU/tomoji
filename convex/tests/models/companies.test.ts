/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import type { Id } from "../../_generated/dataModel";
import {
  createCompany,
  getCompanyByWorkosId,
  listCompanies,
  requireCompany,
  updateCompany,
} from "../../models/companies";
import schema from "../../schema";
import { expectApiError, seedUser, type TestConvex } from "../helpers";

const modules = import.meta.glob("../../**/*.ts");

async function insertCompany(t: TestConvex, workosId: string, name = "Acme") {
  return await t.run(async (ctx) => await createCompany(ctx, { workosId, name }));
}

async function companyRow(t: TestConvex, companyId: Id<"companies">) {
  return await t.run(async (ctx) => await ctx.db.get(companyId));
}

describe("getCompanyByWorkosId", () => {
  test("returns the company synced for the org", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "co1", org: { id: "org_acme", name: "Acme Inc" } });

    const company = await t.run(async (ctx) => await getCompanyByWorkosId(ctx, "org_acme"));

    expect(company).not.toBeNull();
    expect(company?.workosId).toBe("org_acme");
    expect(company?.name).toBe("Acme Inc");
  });

  test("returns null for an org that has never synced", async () => {
    const t = convexTest(schema, modules);

    const company = await t.run(async (ctx) => await getCompanyByWorkosId(ctx, "org_ghost"));

    expect(company).toBeNull();
  });

  test("matches on the workos id rather than returning any company", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "co2", org: { id: "org_acme" } });
    await seedUser(t, { subject: "co3", org: { id: "org_other" } });

    const company = await t.run(async (ctx) => await getCompanyByWorkosId(ctx, "org_other"));

    expect(company?.workosId).toBe("org_other");
  });
});

describe("requireCompany", () => {
  test("returns the company row", async () => {
    const t = convexTest(schema, modules);
    const companyId = await insertCompany(t, "org_acme");

    const company = await t.run(async (ctx) => await requireCompany(ctx, companyId));

    expect(company._id).toBe(companyId);
  });

  test("throws not_found for a company that no longer exists", async () => {
    const t = convexTest(schema, modules);
    const companyId = await insertCompany(t, "org_gone");
    await t.run(async (ctx) => await ctx.db.delete(companyId));

    await expectApiError(
      () => t.run(async (ctx) => await requireCompany(ctx, companyId)),
      "not_found",
    );
  });
});

describe("createCompany", () => {
  test("stores an active company with a trimmed name", async () => {
    const t = convexTest(schema, modules);

    const companyId = await insertCompany(t, "org_new", "  New Co  ");

    expect(await companyRow(t, companyId)).toMatchObject({
      workosId: "org_new",
      name: "New Co",
      isActive: true,
    });
  });

  test("rejects a blank name without inserting", async () => {
    const t = convexTest(schema, modules);

    await expectApiError(() => insertCompany(t, "org_blank", "   "), "invalid_state");

    const companies = await t.run(async (ctx) => await ctx.db.query("companies").collect());
    expect(companies).toHaveLength(0);
  });

  test("rejects a workos id already synced by the membership webhook", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "co4", org: { id: "org_dup", name: "Original" } });

    await expectApiError(() => insertCompany(t, "org_dup", "Duplicate"), "conflict");

    const companies = await t.run(async (ctx) => await ctx.db.query("companies").collect());
    expect(companies).toHaveLength(1);
    expect(companies[0].name).toBe("Original");
  });
});

describe("updateCompany", () => {
  test("changes only the provided fields", async () => {
    const t = convexTest(schema, modules);
    const companyId = await insertCompany(t, "org_up", "Before");
    await t.run(
      async (ctx) =>
        await updateCompany(ctx, companyId, { profilePicture: "https://example.com/logo.png" }),
    );

    await t.run(async (ctx) => await updateCompany(ctx, companyId, { name: "After" }));

    expect(await companyRow(t, companyId)).toMatchObject({
      name: "After",
      profilePicture: "https://example.com/logo.png",
    });
  });

  test("rejects a blank name and leaves the row unchanged", async () => {
    const t = convexTest(schema, modules);
    const companyId = await insertCompany(t, "org_blank", "Keep");

    await expectApiError(
      () => t.run(async (ctx) => await updateCompany(ctx, companyId, { name: "   " })),
      "invalid_state",
    );
    expect((await companyRow(t, companyId))?.name).toBe("Keep");
  });
});

describe("listCompanies", () => {
  test("pages through every company exactly once", async () => {
    const t = convexTest(schema, modules);
    for (const n of [1, 2, 3]) await insertCompany(t, `org_${n}`);

    const first = await t.run(
      async (ctx) => await listCompanies(ctx, { cursor: null, numItems: 2 }),
    );
    const second = await t.run(
      async (ctx) => await listCompanies(ctx, { cursor: first.continueCursor, numItems: 2 }),
    );

    expect(first.isDone).toBe(false);
    expect(second.isDone).toBe(true);
    expect([...first.page, ...second.page].map((c) => c.workosId).sort()).toEqual([
      "org_1",
      "org_2",
      "org_3",
    ]);
  });
});
