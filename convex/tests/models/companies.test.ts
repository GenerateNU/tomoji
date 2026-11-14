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
      async (ctx) => await updateCompany(ctx, companyId, { industry: "Developer tools" }),
    );

    await t.run(async (ctx) => await updateCompany(ctx, companyId, { name: "After" }));

    expect(await companyRow(t, companyId)).toMatchObject({
      name: "After",
      industry: "Developer tools",
    });
  });

  test("sets the website and description", async () => {
    const t = convexTest(schema, modules);
    const companyId = await insertCompany(t, "org_profile", "Acme");

    await t.run(
      async (ctx) =>
        await updateCompany(ctx, companyId, {
          website: "https://acme.com",
          description: "Developer tools.",
        }),
    );

    expect(await companyRow(t, companyId)).toMatchObject({
      website: "https://acme.com/",
      description: "Developer tools.",
    });
  });

  test("rejects a blank website and leaves the row unchanged", async () => {
    const t = convexTest(schema, modules);
    const companyId = await insertCompany(t, "org_site");
    await t.run(
      async (ctx) => await updateCompany(ctx, companyId, { website: "https://acme.com" }),
    );

    await expectApiError(
      () => t.run(async (ctx) => await updateCompany(ctx, companyId, { website: " " })),
      "invalid_state",
    );
    expect((await companyRow(t, companyId))?.website).toBe("https://acme.com/");
  });

  test.each([
    ["a bare domain", "acme.com"],
    ["plain http", "http://acme.com"],
    ["a javascript scheme", "javascript:alert(1)"],
    ["login details that disguise the host", "https://acme.com@evil.test"],
  ])("rejects %s as a website and leaves the row unchanged", async (_label, website) => {
    const t = convexTest(schema, modules);
    const companyId = await insertCompany(t, "org_bad_site");
    await t.run(
      async (ctx) => await updateCompany(ctx, companyId, { website: "https://acme.com" }),
    );

    await expectApiError(
      () => t.run(async (ctx) => await updateCompany(ctx, companyId, { website })),
      "invalid_state",
    );
    expect((await companyRow(t, companyId))?.website).toBe("https://acme.com/");
  });

  test("rejects a blank description and leaves the row unchanged", async () => {
    const t = convexTest(schema, modules);
    const companyId = await insertCompany(t, "org_desc");
    await t.run(async (ctx) => await updateCompany(ctx, companyId, { description: "Tools." }));

    await expectApiError(
      () => t.run(async (ctx) => await updateCompany(ctx, companyId, { description: "\n" })),
      "invalid_state",
    );
    expect((await companyRow(t, companyId))?.description).toBe("Tools.");
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

  test("sets the country and industry", async () => {
    const t = convexTest(schema, modules);
    const companyId = await insertCompany(t, "org_profile");

    await t.run(
      async (ctx) =>
        await updateCompany(ctx, companyId, {
          countryOfResidence: "id",
          industry: "  Developer tools  ",
        }),
    );

    expect(await companyRow(t, companyId)).toMatchObject({
      countryOfResidence: "ID",
      industry: "Developer tools",
    });
  });

  test("clears optional fields with null and leaves the rest alone", async () => {
    const t = convexTest(schema, modules);
    const companyId = await insertCompany(t, "org_clear", "Keep");
    await t.run(
      async (ctx) =>
        await updateCompany(ctx, companyId, {
          website: "https://acme.com",
          countryOfResidence: "US",
          industry: "Developer tools",
        }),
    );

    await t.run(
      async (ctx) =>
        await updateCompany(ctx, companyId, { countryOfResidence: null, industry: null }),
    );

    const row = await companyRow(t, companyId);
    expect(row).toMatchObject({ name: "Keep", website: "https://acme.com/" });
    expect(row).not.toHaveProperty("countryOfResidence");
    expect(row).not.toHaveProperty("industry");
  });

  test.each([
    ["an unassigned country code", { countryOfResidence: "ZZ" }],
    ["a blank industry", { industry: "   " }],
    ["an industry longer than the cap", { industry: "x".repeat(81) }],
  ])("rejects %s and leaves the row unchanged", async (_label, fields) => {
    const t = convexTest(schema, modules);
    const companyId = await insertCompany(t, "org_bad_profile", "Keep");
    const before = await companyRow(t, companyId);

    await expectApiError(
      () => t.run(async (ctx) => await updateCompany(ctx, companyId, fields)),
      "invalid_state",
    );
    expect(await companyRow(t, companyId)).toEqual(before);
  });
});

describe("listCompanies", () => {
  test("pages through every company exactly once", async () => {
    const t = convexTest(schema, modules);
    for (const n of [1, 2, 3]) await insertCompany(t, `org_${n}`);

    const first = await t.run(
      async (ctx) => await listCompanies(ctx, { paginationOpts: { cursor: null, numItems: 2 } }),
    );
    const second = await t.run(
      async (ctx) =>
        await listCompanies(ctx, {
          paginationOpts: { cursor: first.continueCursor, numItems: 2 },
        }),
    );

    expect(first.isDone).toBe(false);
    expect(second.isDone).toBe(true);
    expect([...first.page, ...second.page].map((c) => c.workosId).sort()).toEqual([
      "org_1",
      "org_2",
      "org_3",
    ]);
  });

  test("includes inactive companies unless filtered by isActive", async () => {
    const t = convexTest(schema, modules);
    await insertCompany(t, "org_active");
    const inactiveId = await insertCompany(t, "org_inactive");
    await t.run(async (ctx) => await ctx.db.patch(inactiveId, { isActive: false }));
    const list = async (isActive?: boolean) =>
      await t.run(
        async (ctx) =>
          await listCompanies(ctx, { isActive, paginationOpts: { cursor: null, numItems: 10 } }),
      );

    expect((await list()).page.map((c) => c.workosId).sort()).toEqual([
      "org_active",
      "org_inactive",
    ]);
    expect((await list(true)).page.map((c) => c.workosId)).toEqual(["org_active"]);
    expect((await list(false)).page.map((c) => c.workosId)).toEqual(["org_inactive"]);
  });
});
