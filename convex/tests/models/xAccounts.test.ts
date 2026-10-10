/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { getXAccount, saveXAccount } from "../../models/xAccounts";
import schema from "../../schema";
import { expectApiError, seedCreatorId, seedXAccount, xAccountLinkArgs } from "../helpers";

const modules = import.meta.glob("../../**/*.ts");

describe("saveXAccount", () => {
  test("stores verified account metadata separately from retained credentials", async () => {
    const t = convexTest(schema, modules);
    const creatorId = await seedCreatorId(t, "x_owner");
    const account = await t.run(
      async (ctx) => await saveXAccount(ctx, creatorId, xAccountLinkArgs()),
    );

    expect(account).toEqual({
      xAccountId: expect.any(String),
      xUserId: "123456789",
      username: "ada",
      displayName: "Ada Lovelace",
      linkedAt: expect.any(Number),
      updatedAt: expect.any(Number),
      status: "connected",
    });
    expect(await t.run(async (ctx) => await getXAccount(ctx, creatorId))).toEqual(account);
    const credentials = await t.run(
      async (ctx) =>
        await ctx.db
          .query("xAccountCredentials")
          .withIndex("by_xAccountId", (q) => q.eq("xAccountId", account.xAccountId))
          .unique(),
    );
    expect(credentials).toMatchObject({
      accessToken: "test-access-token",
      refreshToken: "test-refresh-token",
      scopes: ["tweet.read", "users.read", "offline.access"],
      credentialVersion: 1,
    });
  });

  test("reconnects in place and replaces the complete token pair", async () => {
    const t = convexTest(schema, modules);
    const { creatorId, account } = await seedXAccount(t, "x_reconnect");
    await t.run(async (ctx) => {
      await ctx.db.patch("xAccounts", account.xAccountId, { status: "reconnect_required" });
    });
    const expiresAt = Date.now() + 3_600_000;
    const result = await t.run(
      async (ctx) =>
        await saveXAccount(
          ctx,
          creatorId,
          xAccountLinkArgs({
            username: "ada_updated",
            accessToken: "new-access-token",
            refreshToken: "new-refresh-token",
            accessTokenExpiresAt: expiresAt,
          }),
        ),
    );
    expect(result).toMatchObject({
      xAccountId: account.xAccountId,
      linkedAt: account.linkedAt,
      username: "ada_updated",
      status: "connected",
    });
    const credentials = await t.run(
      async (ctx) =>
        await ctx.db
          .query("xAccountCredentials")
          .withIndex("by_xAccountId", (q) => q.eq("xAccountId", account.xAccountId))
          .unique(),
    );
    expect(credentials).toMatchObject({
      accessToken: "new-access-token",
      refreshToken: "new-refresh-token",
      accessTokenExpiresAt: expiresAt,
      credentialVersion: 2,
    });
  });

  test("rejects another creator's X identity without overwriting the claimant's connection", async () => {
    const t = convexTest(schema, modules);
    await seedXAccount(t, "x_owner");
    const { creatorId, account } = await seedXAccount(t, "x_claimant", { xUserId: "987654321" });
    await expectApiError(
      () => t.run(async (ctx) => await saveXAccount(ctx, creatorId, xAccountLinkArgs())),
      "conflict",
    );
    expect(await t.run(async (ctx) => await getXAccount(ctx, creatorId))).toEqual(account);
    const credentials = await t.run(
      async (ctx) =>
        await ctx.db
          .query("xAccountCredentials")
          .withIndex("by_xAccountId", (q) => q.eq("xAccountId", account.xAccountId))
          .unique(),
    );
    expect(credentials?.credentialVersion).toBe(1);
  });

  test("switches accounts without leaving duplicate account or credential rows", async () => {
    const t = convexTest(schema, modules);
    const { creatorId, account } = await seedXAccount(t, "x_switch");
    const result = await t.run(
      async (ctx) => await saveXAccount(ctx, creatorId, xAccountLinkArgs({ xUserId: "987654321" })),
    );
    expect(result).toMatchObject({ xAccountId: account.xAccountId, xUserId: "987654321" });
    const rows = await t.run(async (ctx) => ({
      accounts: await ctx.db.query("xAccounts").collect(),
      credentials: await ctx.db.query("xAccountCredentials").collect(),
    }));
    expect(rows.accounts).toHaveLength(1);
    expect(rows.credentials).toHaveLength(1);
    expect(rows.credentials[0].credentialVersion).toBe(2);
  });

  test("rejects expired tokens without altering an existing connection", async () => {
    const t = convexTest(schema, modules);
    const { creatorId, account } = await seedXAccount(t, "x_expired");
    await expectApiError(
      () =>
        t.run(
          async (ctx) =>
            await saveXAccount(
              ctx,
              creatorId,
              xAccountLinkArgs({ accessTokenExpiresAt: Date.now() - 1 }),
            ),
        ),
      "invalid_state",
    );
    expect(await t.run(async (ctx) => await getXAccount(ctx, creatorId))).toEqual(account);
  });

  test("rejects a missing refresh token before storing anything", async () => {
    const t = convexTest(schema, modules);
    const creatorId = await seedCreatorId(t, "x_no_refresh");
    await expectApiError(
      () =>
        t.run(
          async (ctx) =>
            await saveXAccount(ctx, creatorId, xAccountLinkArgs({ refreshToken: " " })),
        ),
      "invalid_state",
    );
    expect(await t.run(async (ctx) => await getXAccount(ctx, creatorId))).toBeNull();
  });

  test("rejects incomplete granted scopes", async () => {
    const t = convexTest(schema, modules);
    const creatorId = await seedCreatorId(t, "x_no_scope");
    await expectApiError(
      () =>
        t.run(
          async (ctx) =>
            await saveXAccount(ctx, creatorId, xAccountLinkArgs({ scopes: ["users.read"] })),
        ),
      "invalid_state",
    );
  });

  test("rejects an invalid X ID rather than treating a username as identity", async () => {
    const t = convexTest(schema, modules);
    const creatorId = await seedCreatorId(t, "x_invalid_id");
    await expectApiError(
      () =>
        t.run(
          async (ctx) => await saveXAccount(ctx, creatorId, xAccountLinkArgs({ xUserId: "ada" })),
        ),
      "invalid_state",
    );
  });

  test("rejects a creator deactivated before completion", async () => {
    const t = convexTest(schema, modules);
    const creatorId = await seedCreatorId(t, "x_inactive");
    await t.run(async (ctx) => {
      const creator = await ctx.db.get("creators", creatorId);
      if (creator === null) throw new Error("expected seeded creator");
      await ctx.db.patch("users", creator.userId, { isActive: false });
    });
    await expectApiError(
      () => t.run(async (ctx) => await saveXAccount(ctx, creatorId, xAccountLinkArgs())),
      "not_found",
    );
  });
});

describe("getXAccount", () => {
  test("does not treat a manually entered legacy xId as a verified connection", async () => {
    const t = convexTest(schema, modules);
    const creatorId = await seedCreatorId(t, "x_legacy");
    await t.run(async (ctx) => await ctx.db.patch("creators", creatorId, { xId: "123456789" }));
    expect(await t.run(async (ctx) => await getXAccount(ctx, creatorId))).toBeNull();
  });
});
