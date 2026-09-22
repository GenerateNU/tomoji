/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import { getCompanyByWorkosId } from "../models/companies";
import schema from "../schema";
import {
  expectApiError,
  seedOperator,
  seedUser,
  seedWrongOrgCaller,
  workosIdentity,
  type TestConvex,
} from "./helpers";

const modules = import.meta.glob("../**/*.ts");

const firstPage = { paginationOpts: { cursor: null, numItems: 10 } };

async function companyFor(t: TestConvex, orgId: string) {
  const company = await t.run(async (ctx) => await getCompanyByWorkosId(ctx, orgId));
  if (company === null) throw new Error(`expected a company for ${orgId}`);
  return company;
}

describe("companies.get", () => {
  test("with no id, returns the caller's own company", async () => {
    const t = convexTest(schema, modules);
    const asMember = await seedUser(t, { subject: "g1", org: { id: "org_acme", name: "Acme" } });

    const company = await asMember.query(api.companies.get, {});

    expect(company).toMatchObject({ workosId: "org_acme", name: "Acme" });
  });

  test("with no id, uses the org on the current token for a multi-company user", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "g2", org: { id: "org_a", name: "A" } });
    const asB = await seedUser(t, { subject: "g2", org: { id: "org_b", name: "B" } });

    const company = await asB.query(api.companies.get, {});

    expect(company.name).toBe("B");
  });

  test("with an id, lets any signed-in user read that company", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "g3", org: { id: "org_acme" } });
    const asCreator = await seedUser(t, { subject: "g4" });
    const { _id: companyId } = await companyFor(t, "org_acme");

    const company = await asCreator.query(api.companies.get, { companyId });

    expect(company._id).toBe(companyId);
  });

  test("with an id, throws not_found for a company that no longer exists", async () => {
    const t = convexTest(schema, modules);
    const asCreator = await seedUser(t, { subject: "g5" });
    const companyId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("companies", {
        workosId: "org_gone",
        name: "Gone",
        isActive: true,
      });
      await ctx.db.delete(id);
      return id;
    });

    await expectApiError(() => asCreator.query(api.companies.get, { companyId }), "not_found");
  });

  test("with no id, rejects a creator", async () => {
    const t = convexTest(schema, modules);
    const asCreator = await seedUser(t, { subject: "g6" });

    await expectApiError(() => asCreator.query(api.companies.get, {}), "forbidden");
  });

  test("with no id, rejects an operator", async () => {
    const t = convexTest(schema, modules);
    const asOperator = await seedOperator(t, "g7");

    await expectApiError(() => asOperator.query(api.companies.get, {}), "forbidden");
  });

  test("with no id, rejects a company token that carries no organization", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "g8", org: { id: "org_acme" } });
    const asNoOrg = t.withIdentity(workosIdentity({ subject: "g8" }));

    await expectApiError(() => asNoOrg.query(api.companies.get, {}), "misconfigured");
  });

  test("rejects a signed-out caller", async () => {
    const t = convexTest(schema, modules);

    await expectApiError(() => t.query(api.companies.get, {}), "not_authenticated");
  });
});

describe("companies.update", () => {
  test("updates the caller's company", async () => {
    const t = convexTest(schema, modules);
    const asMember = await seedUser(t, { subject: "u1", org: { id: "org_acme" } });

    const result = await asMember.mutation(api.companies.update, {
      name: "Acme Rebrand",
      profilePicture: "https://example.com/logo.png",
    });

    expect(result).toBeNull();
    expect(await companyFor(t, "org_acme")).toMatchObject({
      name: "Acme Rebrand",
      profilePicture: "https://example.com/logo.png",
    });
  });

  test("only updates the company on the current token for a multi-company user", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "u2", org: { id: "org_a", name: "A" } });
    const asB = await seedUser(t, { subject: "u2", org: { id: "org_b", name: "B" } });

    await asB.mutation(api.companies.update, { name: "B2" });

    expect((await companyFor(t, "org_a")).name).toBe("A");
    expect((await companyFor(t, "org_b")).name).toBe("B2");
  });

  test("rejects a creator", async () => {
    const t = convexTest(schema, modules);
    const asCreator = await seedUser(t, { subject: "u3" });

    await expectApiError(
      () => asCreator.mutation(api.companies.update, { name: "X" }),
      "forbidden",
    );
  });

  test("rejects an operator", async () => {
    const t = convexTest(schema, modules);
    const asOperator = await seedOperator(t, "u4");

    await expectApiError(
      () => asOperator.mutation(api.companies.update, { name: "X" }),
      "forbidden",
    );
  });

  test("rejects a caller acting on an org they are not a member of", async () => {
    const t = convexTest(schema, modules);
    const asWrongOrg = await seedWrongOrgCaller(t);

    await expectApiError(
      () => asWrongOrg.mutation(api.companies.update, { name: "Hijacked" }),
      "forbidden",
    );
    expect((await companyFor(t, "org_other")).name).toBe("Other");
  });

  test("rejects a signed-out caller", async () => {
    const t = convexTest(schema, modules);

    await expectApiError(
      () => t.mutation(api.companies.update, { name: "X" }),
      "not_authenticated",
    );
  });
});

describe("companies.create", () => {
  test("lets an operator create an active company", async () => {
    const t = convexTest(schema, modules);
    const asOperator = await seedOperator(t, "c1");

    const companyId = await asOperator.mutation(api.companies.create, {
      workosId: "org_new",
      name: "New Co",
    });

    expect(await companyFor(t, "org_new")).toMatchObject({
      _id: companyId,
      name: "New Co",
      isActive: true,
    });
  });

  test("rejects a creator", async () => {
    const t = convexTest(schema, modules);
    const asCreator = await seedUser(t, { subject: "c2" });

    await expectApiError(
      () => asCreator.mutation(api.companies.create, { workosId: "org_x", name: "X" }),
      "forbidden",
    );
  });

  test("rejects a company user", async () => {
    const t = convexTest(schema, modules);
    const asMember = await seedUser(t, { subject: "c3", org: { id: "org_acme" } });

    await expectApiError(
      () => asMember.mutation(api.companies.create, { workosId: "org_x", name: "X" }),
      "forbidden",
    );
  });

  test("rejects a signed-out caller", async () => {
    const t = convexTest(schema, modules);

    await expectApiError(
      () => t.mutation(api.companies.create, { workosId: "org_x", name: "X" }),
      "not_authenticated",
    );
  });
});

describe("companies.list", () => {
  test("lets an operator list every company", async () => {
    const t = convexTest(schema, modules);
    const asOperator = await seedOperator(t, "l1");
    await seedUser(t, { subject: "l2", org: { id: "org_a" } });
    await seedUser(t, { subject: "l3", org: { id: "org_b" } });

    const result = await asOperator.query(api.companies.list, firstPage);

    expect(result.page.map((c) => c.workosId).sort()).toEqual(["org_a", "org_b"]);
    expect(result.isDone).toBe(true);
  });

  test("rejects a creator", async () => {
    const t = convexTest(schema, modules);
    const asCreator = await seedUser(t, { subject: "l4" });

    await expectApiError(() => asCreator.query(api.companies.list, firstPage), "forbidden");
  });

  test("rejects a company user", async () => {
    const t = convexTest(schema, modules);
    const asMember = await seedUser(t, { subject: "l5", org: { id: "org_acme" } });

    await expectApiError(() => asMember.query(api.companies.list, firstPage), "forbidden");
  });

  test("rejects a signed-out caller", async () => {
    const t = convexTest(schema, modules);

    await expectApiError(() => t.query(api.companies.list, firstPage), "not_authenticated");
  });
});
