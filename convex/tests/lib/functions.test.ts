/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { companyContext, creatorContext, operatorContext } from "../../lib/functions";
import { byWorkosId } from "../../models/users";
import schema from "../../schema";
import { expectApiError, seedUser } from "../helpers";

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
      const user = await byWorkosId(ctx, subject);
      await ctx.db.patch(user!._id, {
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
