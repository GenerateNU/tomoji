/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import { removeMembership } from "../models/users";
import schema from "../schema";
import { expectApiError, seedOperator, seedUser, seedWrongOrgCaller } from "./helpers";

const modules = import.meta.glob("../**/*.ts");

const firstPage = { paginationOpts: { cursor: null, numItems: 10 } };

describe("companyUsers.list", () => {
  test("lists the members of the caller's company and no one else", async () => {
    const t = convexTest(schema, modules);
    const asAdmin = await seedUser(t, {
      subject: "cu1",
      email: "admin@acme.com",
      org: { id: "org_acme", role: "admin" },
    });
    await seedUser(t, { subject: "cu2", email: "member@acme.com", org: { id: "org_acme" } });
    await seedUser(t, { subject: "cu3", email: "someone@other.com", org: { id: "org_other" } });

    const { page } = await asAdmin.query(api.companyUsers.list, firstPage);

    expect(page.map((m) => `${m.email}:${m.role}`).sort()).toEqual([
      "admin@acme.com:admin",
      "member@acme.com:member",
    ]);
  });

  test("lists the new company's members after the previous membership is removed", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "cu4", org: { id: "org_a" } });
    await t.run(
      async (ctx) =>
        await removeMembership(ctx, {
          workosUserId: "cu4",
          organizationId: "org_a",
        }),
    );
    await seedUser(t, { subject: "cu5", email: "b@b.com", org: { id: "org_b" } });
    const asB = await seedUser(t, { subject: "cu4", org: { id: "org_b" } });

    const { page } = await asB.query(api.companyUsers.list, firstPage);

    expect(page.map((m) => m.email).sort()).toEqual(["b@b.com", "cu4@example.com"]);
  });

  test("rejects a creator", async () => {
    const t = convexTest(schema, modules);
    const asCreator = await seedUser(t, { subject: "cu6" });

    await expectApiError(() => asCreator.query(api.companyUsers.list, firstPage), "forbidden");
  });

  test("rejects an operator", async () => {
    const t = convexTest(schema, modules);
    const asOperator = await seedOperator(t, "cu7");

    await expectApiError(() => asOperator.query(api.companyUsers.list, firstPage), "forbidden");
  });

  test("rejects a caller acting on an org they are not a member of", async () => {
    const t = convexTest(schema, modules);
    const asWrongOrg = await seedWrongOrgCaller(t);

    await expectApiError(() => asWrongOrg.query(api.companyUsers.list, firstPage), "forbidden");
  });

  test("rejects a signed-out caller", async () => {
    const t = convexTest(schema, modules);

    await expectApiError(() => t.query(api.companyUsers.list, firstPage), "not_authenticated");
  });
});
