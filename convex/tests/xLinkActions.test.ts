/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "../_generated/api";
import schema from "../schema";
import {
  expectApiError,
  seedOperator,
  seedUser,
  seedXAccount,
  xTokenResponse,
  xIdentityResponse,
} from "./helpers";

const modules = import.meta.glob("../**/*.ts");
beforeEach(() => {
  vi.stubEnv("X_CLIENT_ID", "test-client");
  vi.stubEnv("X_CLIENT_SECRET", "test-secret");
  vi.stubEnv("X_REDIRECT_URI", "http://localhost:3000/api/x/callback");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

test("the scheduled expiry actually removes PKCE secrets after ten minutes", async () => {
  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  const asCreator = await seedUser(t, { subject: "x_scheduled_expiry" });
  await asCreator.action(api.xAccounts.start, {});
  expect(await t.run((ctx) => ctx.db.query("xLinkAttempts").collect())).toHaveLength(1);
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await t.run((ctx) => ctx.db.query("xLinkAttempts").collect())).toEqual([]);
});

test("an active creator completes PKCE linking and receives metadata, never tokens", async () => {
  const t = convexTest(schema, modules);
  const asCreator = await seedUser(t, { subject: "x_flow" });
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(xTokenResponse())
    .mockResolvedValueOnce(xIdentityResponse());
  vi.stubGlobal("fetch", fetch);
  const grant = await asCreator.action(api.xAccounts.start, {});
  const state = new URL(grant.authorizationUrl).searchParams.get("state")!;
  const account = await asCreator.action(api.xAccounts.complete, { state, code: "code" });
  expect(account).toEqual({
    xAccountId: expect.any(String),
    xUserId: "12345678901234567890",
    username: "ada",
    displayName: "Ada Lovelace",
    linkedAt: expect.any(Number),
    updatedAt: expect.any(Number),
    status: "connected",
  });
  expect(await asCreator.query(api.xAccounts.me, {})).toEqual(account);
  expect(fetch.mock.calls[1][0]).toBe("https://api.x.com/2/users/me");
  expect(fetch.mock.calls[1][1].headers.Authorization).toBe("Bearer new-access");
  const stored = await t.run((ctx) => ctx.db.query("xAccountCredentials").collect());
  expect(stored[0]).toMatchObject({
    accessToken: "new-access",
    refreshToken: "new-refresh",
    credentialVersion: 1,
  });
  await expectApiError(
    () => asCreator.action(api.xAccounts.complete, { state, code: "code" }),
    "invalid_state",
  );
  expect(fetch).toHaveBeenCalledTimes(2);
});

test("a different creator cannot consume another creator's state", async () => {
  const t = convexTest(schema, modules);
  const asOwner = await seedUser(t, { subject: "x_state_owner" });
  const asOther = await seedUser(t, { subject: "x_state_other" });
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const grant = await asOwner.action(api.xAccounts.start, {});
  const state = new URL(grant.authorizationUrl).searchParams.get("state")!;
  await expectApiError(
    () => asOther.action(api.xAccounts.complete, { state, code: "code" }),
    "invalid_state",
  );
  expect(fetch).not.toHaveBeenCalled();
  expect((await t.run((ctx) => ctx.db.query("xLinkAttempts").collect()))[0].status).toBe("pending");
});

test("failed reconnect preserves existing credentials and clears the consumed verifier", async () => {
  const t = convexTest(schema, modules);
  const { asCreator, account } = await seedXAccount(t, "x_failed_reconnect");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("sensitive upstream error", { status: 503 })),
  );
  const grant = await asCreator.action(api.xAccounts.start, {});
  const state = new URL(grant.authorizationUrl).searchParams.get("state")!;
  await expectApiError(
    () => asCreator.action(api.xAccounts.complete, { state, code: "code" }),
    "upstream_failure",
  );
  expect(await asCreator.query(api.xAccounts.me, {})).toEqual(account);
  const rows = await t.run(async (ctx) => ({
    attempts: await ctx.db.query("xLinkAttempts").collect(),
    credentials: await ctx.db.query("xAccountCredentials").collect(),
  }));
  expect(rows.attempts[0]).toMatchObject({ status: "failed" });
  expect(rows.attempts[0].verifier).toBeUndefined();
  expect(rows.credentials[0]).toMatchObject({
    accessToken: "test-access-token",
    credentialVersion: 1,
  });
});

test("denial consumes the attempt without calling X or disconnecting the current account", async () => {
  const t = convexTest(schema, modules);
  const { asCreator, account } = await seedXAccount(t, "x_denied");
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const grant = await asCreator.action(api.xAccounts.start, {});
  const state = new URL(grant.authorizationUrl).searchParams.get("state")!;
  await expectApiError(
    () => asCreator.action(api.xAccounts.complete, { state, denied: true }),
    "invalid_state",
  );
  expect(fetch).not.toHaveBeenCalled();
  expect(await asCreator.query(api.xAccounts.me, {})).toEqual(account);
});

test("a new start invalidates an older callback", async () => {
  const t = convexTest(schema, modules);
  const asCreator = await seedUser(t, { subject: "x_new_attempt" });
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const old = await asCreator.action(api.xAccounts.start, {});
  await asCreator.action(api.xAccounts.start, {});
  const state = new URL(old.authorizationUrl).searchParams.get("state")!;
  await expectApiError(
    () => asCreator.action(api.xAccounts.complete, { state, code: "code" }),
    "invalid_state",
  );
  expect(fetch).not.toHaveBeenCalled();
});

test("disconnect during exchange prevents a late completion from restoring the account", async () => {
  const t = convexTest(schema, modules);
  const asCreator = await seedUser(t, { subject: "x_inflight_remove" });
  const fetch = vi
    .fn()
    .mockImplementationOnce(async () => {
      await asCreator.action(api.xAccounts.remove, {});
      return xTokenResponse();
    })
    .mockResolvedValueOnce(xIdentityResponse());
  vi.stubGlobal("fetch", fetch);
  const grant = await asCreator.action(api.xAccounts.start, {});
  const state = new URL(grant.authorizationUrl).searchParams.get("state")!;
  await expectApiError(
    () => asCreator.action(api.xAccounts.complete, { state, code: "code" }),
    "invalid_state",
  );
  expect(await asCreator.query(api.xAccounts.me, {})).toBeNull();
  expect(await t.run((ctx) => ctx.db.query("xAccountCredentials").collect())).toEqual([]);
});

test("disconnect clears local credentials even if upstream revocation fails", async () => {
  const t = convexTest(schema, modules);
  const { asCreator } = await seedXAccount(t, "x_revoke_failure");
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("private-token-in-network-error")));
  expect(await asCreator.action(api.xAccounts.remove, {})).toEqual({ revocation: "failed" });
  expect(await asCreator.query(api.xAccounts.me, {})).toBeNull();
  expect(await t.run((ctx) => ctx.db.query("xAccountCredentials").collect())).toEqual([]);
  expect(await asCreator.action(api.xAccounts.remove, {})).toEqual({ revocation: "not_needed" });
});

test("disconnect revokes both retained tokens without exposing them", async () => {
  const t = convexTest(schema, modules);
  const { asCreator } = await seedXAccount(t, "x_revoke_success");
  const fetch = vi.fn().mockImplementation(async () => new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetch);
  expect(await asCreator.action(api.xAccounts.remove, {})).toEqual({ revocation: "complete" });
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(new URLSearchParams(fetch.mock.calls[0][1].body).get("token")).toBe("test-refresh-token");
  expect(new URLSearchParams(fetch.mock.calls[1][1].body).get("token")).toBe("test-access-token");
});

test("a failed refresh-token revocation does not skip access-token revocation", async () => {
  const t = convexTest(schema, modules);
  const { asCreator } = await seedXAccount(t, "x_partial_revoke");
  const fetch = vi
    .fn()
    .mockRejectedValueOnce(new Error("unavailable"))
    .mockResolvedValueOnce(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetch);
  expect(await asCreator.action(api.xAccounts.remove, {})).toEqual({ revocation: "failed" });
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(await asCreator.query(api.xAccounts.me, {})).toBeNull();
});

test("deactivated creators cannot start linking", async () => {
  const t = convexTest(schema, modules);
  const { asCreator, creatorId } = await seedXAccount(t, "x_deactivated");
  await t.run(async (ctx) => {
    const creator = await ctx.db.get("creators", creatorId);
    if (creator === null) throw new Error("expected seeded creator");
    await ctx.db.patch("users", creator.userId, { isActive: false });
  });
  await expectApiError(() => asCreator.action(api.xAccounts.start, {}), "account_deactivated");
});

test("signed-out callers cannot start, complete, or remove a connection", async () => {
  const t = convexTest(schema, modules);
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  await expectApiError(() => t.action(api.xAccounts.start, {}), "not_authenticated");
  await expectApiError(
    () => t.action(api.xAccounts.complete, { state: "state", code: "code" }),
    "not_authenticated",
  );
  await expectApiError(() => t.action(api.xAccounts.remove, {}), "not_authenticated");
  expect(fetch).not.toHaveBeenCalled();
});

test("company callers cannot start, complete, or remove a connection", async () => {
  const t = convexTest(schema, modules);
  const asCompany = await seedUser(t, { subject: "x_company", org: { id: "x_org" } });
  await expectApiError(() => asCompany.action(api.xAccounts.start, {}), "forbidden");
  await expectApiError(
    () => asCompany.action(api.xAccounts.complete, { state: "state", code: "code" }),
    "forbidden",
  );
  await expectApiError(() => asCompany.action(api.xAccounts.remove, {}), "forbidden");
});

test("operator callers cannot start linking", async () => {
  const t = convexTest(schema, modules);
  const asOperator = await seedOperator(t, "x_operator");
  await expectApiError(() => asOperator.action(api.xAccounts.start, {}), "forbidden");
});
