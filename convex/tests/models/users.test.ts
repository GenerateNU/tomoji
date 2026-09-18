/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import {
  applyMembership,
  byWorkosId,
  deactivateUser,
  removeMembership,
  requireRole,
  requireUser,
  syncMembership,
  upsertUser,
} from "../../models/users";
import schema from "../../schema";
import { expectApiError, seedUser, workosIdentity } from "../helpers";

const modules = import.meta.glob("../../**/*.ts");

describe("upsertUser", () => {
  test("creates a creator with a profile row", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "u1" });

    const counts = await t.run(async (ctx) => ({
      users: (await ctx.db.query("users").collect()).length,
      creators: (await ctx.db.query("creators").collect()).length,
    }));
    expect(counts).toEqual({ users: 1, creators: 1 });
  });

  test("is idempotent", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "u2" });
    await seedUser(t, { subject: "u2" });

    const users = await t.run(async (ctx) => await ctx.db.query("users").collect());
    expect(users).toHaveLength(1);
  });

  test("falls back to the email when WorkOS has no name", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "u3", email: "dev@example.com" });

    const user = await t.run(async (ctx) => await byWorkosId(ctx, "u3"));
    expect(user?.name).toBe("dev@example.com");
  });

  test("does not overwrite a promotion to operator", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "u4" });
    await t.run(async (ctx) => {
      const user = await byWorkosId(ctx, "u4");
      await ctx.db.patch(user!._id, { role: "operator" });
      await upsertUser(ctx, { workosId: "u4", email: "u4@example.com" });
    });

    const user = await t.run(async (ctx) => await byWorkosId(ctx, "u4"));
    expect(user?.role).toBe("operator");
  });

  test("does not reactivate an account an operator deactivated", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "u5" });
    await t.run(async (ctx) => {
      await deactivateUser(ctx, "u5");
      await upsertUser(ctx, { workosId: "u5", email: "u5@example.com" });
    });

    const user = await t.run(async (ctx) => await byWorkosId(ctx, "u5"));
    expect(user?.isActive).toBe(false);
  });
});

describe("applyMembership", () => {
  test("creates the company from the event and promotes the user", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "u6", org: { id: "org_acme", name: "Acme Inc" } });

    const user = await t.run(async (ctx) => await byWorkosId(ctx, "u6"));
    const companies = await t.run(async (ctx) => await ctx.db.query("companies").collect());
    const memberships = await t.run(async (ctx) => await ctx.db.query("companyUsers").collect());

    expect(user?.role).toBe("company");
    expect(companies[0]?.name).toBe("Acme Inc");
    expect(memberships).toHaveLength(1);
  });

  test("two members share one company row", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "u7", org: { id: "org_acme" } });
    await seedUser(t, { subject: "u8", org: { id: "org_acme" } });

    const counts = await t.run(async (ctx) => ({
      companies: (await ctx.db.query("companies").collect()).length,
      memberships: (await ctx.db.query("companyUsers").collect()).length,
    }));
    expect(counts).toEqual({ companies: 1, memberships: 2 });
  });

  test("a role change updates the membership in place", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "u9", org: { id: "org_acme", role: "member" } });
    await t.run(async (ctx) => {
      await applyMembership(ctx, {
        workosUserId: "u9",
        organizationId: "org_acme",
        organizationName: "Acme",
        role: "admin",
      });
    });

    const memberships = await t.run(async (ctx) => await ctx.db.query("companyUsers").collect());
    expect(memberships).toHaveLength(1);
    expect(memberships[0]?.role).toBe("admin");
  });

  test("does not demote an operator who joins a company", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "u10" });
    await t.run(async (ctx) => {
      const user = await byWorkosId(ctx, "u10");
      await ctx.db.patch(user!._id, { role: "operator" });
      await applyMembership(ctx, {
        workosUserId: "u10",
        organizationId: "org_acme",
        organizationName: "Acme",
        role: "admin",
      });
    });

    const user = await t.run(async (ctx) => await byWorkosId(ctx, "u10"));
    expect(user?.role).toBe("operator");
  });
});

describe("removeMembership", () => {
  test("drops the membership and returns the user to creator", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "u11", org: { id: "org_acme" } });
    await t.run(
      async (ctx) =>
        await removeMembership(ctx, { workosUserId: "u11", organizationId: "org_acme" }),
    );

    const user = await t.run(async (ctx) => await byWorkosId(ctx, "u11"));
    const memberships = await t.run(async (ctx) => await ctx.db.query("companyUsers").collect());

    expect(user?.role).toBe("creator");
    expect(memberships).toHaveLength(0);
  });

  test("keeps the company role while another membership remains", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "u12", org: { id: "org_acme" } });
    await seedUser(t, { subject: "u12", org: { id: "org_other" } });
    await t.run(
      async (ctx) =>
        await removeMembership(ctx, { workosUserId: "u12", organizationId: "org_acme" }),
    );

    const user = await t.run(async (ctx) => await byWorkosId(ctx, "u12"));
    expect(user?.role).toBe("company");
  });
});

describe("deactivateUser", () => {
  test("soft deletes rather than removing the row", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "u13" });
    await t.run(async (ctx) => await deactivateUser(ctx, "u13"));

    const user = await t.run(async (ctx) => await byWorkosId(ctx, "u13"));
    expect(user).not.toBeNull();
    expect(user?.isActive).toBe(false);
  });
});

describe("requireUser / requireRole", () => {
  test("rejects a caller whose webhook has not landed", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity(workosIdentity({ subject: "u14" }));

    await expectApiError(() => asUser.run(async (ctx) => await requireUser(ctx)), "not_synced");
  });

  test("rejects a deactivated account", async () => {
    const t = convexTest(schema, modules);
    const asUser = await seedUser(t, { subject: "u15" });
    await t.run(async (ctx) => await deactivateUser(ctx, "u15"));

    await expectApiError(
      () => asUser.run(async (ctx) => await requireUser(ctx)),
      "account_deactivated",
    );
  });

  test("rejects the wrong account type", async () => {
    const t = convexTest(schema, modules);
    const asCreator = await seedUser(t, { subject: "u16" });

    await expectApiError(
      () => asCreator.run(async (ctx) => await requireRole(ctx, "company")),
      "forbidden",
    );
  });

  test("returns the caller and their org for the right type", async () => {
    const t = convexTest(schema, modules);
    const asCompany = await seedUser(t, { subject: "u17", org: { id: "org_acme" } });

    const result = await asCompany.run(async (ctx) => await requireRole(ctx, "company"));

    expect(result.user.role).toBe("company");
    expect(result.orgId).toBe("org_acme");
  });
});

describe("out-of-order webhook delivery", () => {
  test("a membership arriving before the user is not silently dropped", async () => {
    const t = convexTest(schema, modules);

    // WorkOS gives no cross-topic ordering guarantee, so the membership event
    // can beat user.created. Throwing is what makes WorkOS retry it.
    await expectApiError(
      () =>
        t.run(async (ctx) => {
          await applyMembership(ctx, {
            workosUserId: "u18",
            organizationId: "org_acme",
            organizationName: "Acme",
            role: "admin",
          });
        }),
      "not_synced",
    );

    // On retry, after user.created has landed, it applies.
    await seedUser(t, { subject: "u18" });
    await t.run(async (ctx) => {
      await applyMembership(ctx, {
        workosUserId: "u18",
        organizationId: "org_acme",
        organizationName: "Acme",
        role: "admin",
      });
    });

    const user = await t.run(async (ctx) => await byWorkosId(ctx, "u18"));
    const memberships = await t.run(async (ctx) => await ctx.db.query("companyUsers").collect());
    expect(user?.role).toBe("company");
    expect(memberships).toHaveLength(1);
  });
});

describe("syncMembership", () => {
  test("a pending invitation grants no access", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "u19" });
    await t.run(async (ctx) => {
      await syncMembership(ctx, {
        workosUserId: "u19",
        organizationId: "org_acme",
        organizationName: "Acme",
        role: "admin",
        status: "pending",
      });
    });

    const user = await t.run(async (ctx) => await byWorkosId(ctx, "u19"));
    const memberships = await t.run(async (ctx) => await ctx.db.query("companyUsers").collect());
    expect(user?.role).toBe("creator");
    expect(memberships).toHaveLength(0);
  });

  test("deactivation revokes access", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "u20", org: { id: "org_acme" } });

    // WorkOS deactivates by flipping status to inactive — no deleted event fires.
    await t.run(async (ctx) => {
      await syncMembership(ctx, {
        workosUserId: "u20",
        organizationId: "org_acme",
        organizationName: "Acme",
        role: "member",
        status: "inactive",
      });
    });

    const user = await t.run(async (ctx) => await byWorkosId(ctx, "u20"));
    const memberships = await t.run(async (ctx) => await ctx.db.query("companyUsers").collect());
    expect(user?.role).toBe("creator");
    expect(memberships).toHaveLength(0);
  });

  test("an active membership grants access", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "u21" });
    await t.run(async (ctx) => {
      await syncMembership(ctx, {
        workosUserId: "u21",
        organizationId: "org_acme",
        organizationName: "Acme",
        role: "admin",
        status: "active",
      });
    });

    const user = await t.run(async (ctx) => await byWorkosId(ctx, "u21"));
    expect(user?.role).toBe("company");
  });
});
