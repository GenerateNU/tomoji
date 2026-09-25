/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { companyContext, creatorContext, operatorContext } from "../../lib/functions";
import { getCompanyByWorkosId } from "../../models/companies";
import { getUserByWorkosId, upsertUser } from "../../models/users";
import schema from "../../schema";
import { expectApiError, seedUser, workosIdentity } from "../helpers";

const modules = import.meta.glob("../../**/*.ts");

async function signedIn(
  t: ReturnType<typeof convexTest>,
  subject: string,
  opts: { orgId?: string; promoteTo?: "operator"; deactivate?: boolean } = {},
) {
  const as = await seedUser(t, {
    subject,
    org: opts.orgId ? { id: opts.orgId } : undefined,
  });
  if (opts.promoteTo || opts.deactivate) {
    await t.run(async (ctx) => {
      const user = await getUserByWorkosId(ctx, subject);
      await ctx.db.patch("users", user!._id, {
        ...(opts.promoteTo ? { role: opts.promoteTo } : {}),
        ...(opts.deactivate ? { isActive: false } : {}),
      });
    });
  }
  return as;
}

describe("companyContext", () => {
  test("gives a company user their orgId as a plain string", async () => {
    const t = convexTest(schema, modules);
    const as = await signedIn(t, "u1", { orgId: "org_acme" });

    const result = await as.run(async (ctx) => await companyContext(ctx));

    expect(result.orgId).toBe("org_acme");
    expect(result.user.role).toBe("company");
  });

  test("rejects a creator", async () => {
    const t = convexTest(schema, modules);
    const as = await signedIn(t, "u2");

    await expectApiError(() => as.run(async (ctx) => await companyContext(ctx)), "forbidden");
  });

  test("rejects an operator", async () => {
    const t = convexTest(schema, modules);
    const as = await signedIn(t, "u3", { promoteTo: "operator" });

    await expectApiError(() => as.run(async (ctx) => await companyContext(ctx)), "forbidden");
  });

  test("rejects a signed-out caller", async () => {
    const t = convexTest(schema, modules);

    await expectApiError(
      () => t.run(async (ctx) => await companyContext(ctx)),
      "not_authenticated",
    );
  });

  test("resolves the caller's membership for their org", async () => {
    const t = convexTest(schema, modules);
    const as = await signedIn(t, "u9", { orgId: "org_acme" });

    const result = await as.run(async (ctx) => await companyContext(ctx));
    const company = await t.run(async (ctx) => await getCompanyByWorkosId(ctx, "org_acme"));

    expect(result.membership.userId).toBe(result.user._id);
    expect(result.membership.companyId).toBe(company!._id);
  });

  test("rejects an org whose company row has not synced", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await upsertUser(ctx, { workosId: "u10", email: "u10@example.com" });
      const user = await getUserByWorkosId(ctx, "u10");
      await ctx.db.patch("users", user!._id, { role: "company" });
    });
    const as = t.withIdentity(workosIdentity({ subject: "u10", org_id: "org_ghost" }));

    await expectApiError(() => as.run(async (ctx) => await companyContext(ctx)), "not_synced");
  });

  test("rejects a caller who is not a member of the org", async () => {
    const t = convexTest(schema, modules);
    await signedIn(t, "u11", { orgId: "org_acme" });
    await signedIn(t, "u12", { orgId: "org_other" });
    const asWrongOrg = t.withIdentity(workosIdentity({ subject: "u11", org_id: "org_other" }));

    await expectApiError(
      () => asWrongOrg.run(async (ctx) => await companyContext(ctx)),
      "forbidden",
    );
  });
});

describe("creatorContext", () => {
  test("allows a creator", async () => {
    const t = convexTest(schema, modules);
    const as = await signedIn(t, "u4");

    const result = await as.run(async (ctx) => await creatorContext(ctx));

    expect(result.user.role).toBe("creator");
  });

  test("rejects a company user", async () => {
    const t = convexTest(schema, modules);
    const as = await signedIn(t, "u5", { orgId: "org_acme" });

    await expectApiError(() => as.run(async (ctx) => await creatorContext(ctx)), "forbidden");
  });
});

describe("operatorContext", () => {
  test("allows Tomoji staff", async () => {
    const t = convexTest(schema, modules);
    const as = await signedIn(t, "u6", { promoteTo: "operator" });

    const result = await as.run(async (ctx) => await operatorContext(ctx));

    expect(result.user.role).toBe("operator");
  });

  test("rejects a company admin", async () => {
    const t = convexTest(schema, modules);
    const as = await signedIn(t, "u7", { orgId: "org_acme" });

    await expectApiError(() => as.run(async (ctx) => await operatorContext(ctx)), "forbidden");
  });

  test("rejects a deactivated operator", async () => {
    const t = convexTest(schema, modules);
    const as = await signedIn(t, "u8", { promoteTo: "operator", deactivate: true });

    await expectApiError(
      () => as.run(async (ctx) => await operatorContext(ctx)),
      "account_deactivated",
    );
  });
});
