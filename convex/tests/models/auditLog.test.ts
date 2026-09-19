/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import type { Doc } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { listActionsByUser, listActionsOnTarget, logAction } from "../../models/auditLog";
import { getUserByWorkosId } from "../../models/users";
import schema from "../../schema";
import { seedUser } from "../helpers";

const modules = import.meta.glob("../../**/*.ts");

function asAuditCtx(ctx: MutationCtx, user: Doc<"users">, viaApiKey?: string) {
  return Object.assign(ctx, { user, viaApiKey });
}

describe("logAction", () => {
  test("records the acting user and target", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "a1" });

    await t.run(async (ctx) => {
      const user = (await getUserByWorkosId(ctx, "a1"))!;
      await logAction(asAuditCtx(ctx, user), {
        action: "campaigns.create",
        targetTable: "campaigns",
        targetId: "abc123",
      });
    });

    const entries = await t.run(async (ctx) => await ctx.db.query("auditLog").collect());
    expect(entries).toHaveLength(1);
    expect(entries[0]?.action).toBe("campaigns.create");
    expect(entries[0]?.targetId).toBe("abc123");
  });

  test("leaves viaApiKey unset for a human action", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "a2" });

    await t.run(async (ctx) => {
      const user = (await getUserByWorkosId(ctx, "a2"))!;
      await logAction(asAuditCtx(ctx, user), {
        action: "creators.update",
        targetTable: "creators",
        targetId: "xyz",
      });
    });

    const entry = await t.run(async (ctx) => await ctx.db.query("auditLog").first());
    expect(entry?.viaApiKey).toBeUndefined();
  });

  test("records the key when an agent acted on the user's behalf", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "a3" });

    await t.run(async (ctx) => {
      const user = (await getUserByWorkosId(ctx, "a3"))!;
      await logAction(asAuditCtx(ctx, user, "key_123"), {
        action: "campaigns.create",
        targetTable: "campaigns",
        targetId: "c1",
      });
    });

    const entry = await t.run(async (ctx) => await ctx.db.query("auditLog").first());
    expect(entry?.viaApiKey).toBe("key_123");
    // The user is still the authority; the key is only the instrument.
    const user = await t.run(async (ctx) => await getUserByWorkosId(ctx, "a3"));
    expect(entry?.userId).toBe(user?._id);
  });
});

describe("reading the log", () => {
  test("returns a user's actions newest first", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "a4" });

    await t.run(async (ctx) => {
      const user = (await getUserByWorkosId(ctx, "a4"))!;
      await logAction(asAuditCtx(ctx, user), {
        action: "campaigns.create",
        targetTable: "campaigns",
        targetId: "c1",
      });
      await logAction(asAuditCtx(ctx, user), {
        action: "campaigns.update",
        targetTable: "campaigns",
        targetId: "c1",
      });
    });

    const entries = await t.run(async (ctx) => {
      const user = (await getUserByWorkosId(ctx, "a4"))!;
      return await listActionsByUser(ctx, user._id);
    });

    expect(entries.map((e) => e.action)).toEqual(["campaigns.update", "campaigns.create"]);
  });

  test("scopes history to one row", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "a5" });

    await t.run(async (ctx) => {
      const user = (await getUserByWorkosId(ctx, "a5"))!;
      await logAction(asAuditCtx(ctx, user), {
        action: "campaigns.update",
        targetTable: "campaigns",
        targetId: "wanted",
      });
      await logAction(asAuditCtx(ctx, user), {
        action: "campaigns.update",
        targetTable: "campaigns",
        targetId: "other",
      });
    });

    const entries = await t.run(
      async (ctx) => await listActionsOnTarget(ctx, "campaigns", "wanted"),
    );
    expect(entries).toHaveLength(1);
  });
});
