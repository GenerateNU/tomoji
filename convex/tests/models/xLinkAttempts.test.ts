/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import {
  beginXLink,
  claimXLink,
  expireXLink,
  finishXLink,
  removeOwnXAccount,
  xLinkProcessingTtlMs,
} from "../../models/xLinkAttempts";
import schema from "../../schema";
import {
  expectApiError,
  seedUser,
  seedCreatorId,
  xAccountLinkArgs,
  requireSeededUser,
} from "../helpers";

const modules = import.meta.glob("../../**/*.ts");
afterEach(() => vi.useRealTimers());

test("a callback claimed before expiry can finish after the callback deadline", async () => {
  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  const creatorId = await seedCreatorId(t, "x_boundary_finish");
  const user = await requireSeededUser(t, "x_boundary_finish");
  const link = await xAccountLinkArgs(creatorId);
  const attemptId = await t.run((ctx) =>
    beginXLink(ctx, user, {
      stateHash: "state",
      verifier: "secret",
      redirectUri: "http://localhost:3000/api/x/callback",
    }),
  );
  const attempt = await t.run((ctx) => ctx.db.get("xLinkAttempts", attemptId));
  vi.setSystemTime(attempt!.expiresAt - 1);
  await t.run((ctx) => claimXLink(ctx, user, "state"));
  vi.setSystemTime(attempt!.expiresAt + 1000);
  const account = await t.run((ctx) => finishXLink(ctx, user, attemptId, link));
  expect(account.xUserId).toBe(link.xUserId);
  expect(await t.run((ctx) => ctx.db.get("xLinkAttempts", attemptId))).toBeNull();
});

test("the original cleanup deadline does not delete an exchange claimed on time", async () => {
  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  await seedUser(t, { subject: "x_boundary_cleanup" });
  const user = await requireSeededUser(t, "x_boundary_cleanup");
  const attemptId = await t.run((ctx) =>
    beginXLink(ctx, user, {
      stateHash: "state",
      verifier: "secret",
      redirectUri: "http://localhost:3000/api/x/callback",
    }),
  );
  const attempt = await t.run((ctx) => ctx.db.get("xLinkAttempts", attemptId));
  vi.setSystemTime(attempt!.expiresAt - 1);
  await t.run((ctx) => claimXLink(ctx, user, "state"));
  vi.setSystemTime(attempt!.expiresAt);
  await t.run((ctx) => expireXLink(ctx, attemptId));
  expect((await t.run((ctx) => ctx.db.get("xLinkAttempts", attemptId)))?.status).toBe("exchanging");
});

test("an abandoned exchange is removed at its processing deadline", async () => {
  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  await seedUser(t, { subject: "x_abandoned_exchange" });
  const user = await requireSeededUser(t, "x_abandoned_exchange");
  const attemptId = await t.run((ctx) =>
    beginXLink(ctx, user, {
      stateHash: "state",
      verifier: "secret",
      redirectUri: "http://localhost:3000/api/x/callback",
    }),
  );
  await t.run((ctx) => claimXLink(ctx, user, "state"));
  vi.setSystemTime(Date.now() + xLinkProcessingTtlMs);
  await t.run((ctx) => expireXLink(ctx, attemptId));
  expect(await t.run((ctx) => ctx.db.get("xLinkAttempts", attemptId))).toBeNull();
});

test("completion after its processing deadline is rejected even before cleanup runs", async () => {
  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  const creatorId = await seedCreatorId(t, "x_late_completion");
  const user = await requireSeededUser(t, "x_late_completion");
  const link = await xAccountLinkArgs(creatorId);
  const attemptId = await t.run((ctx) =>
    beginXLink(ctx, user, {
      stateHash: "state",
      verifier: "secret",
      redirectUri: "http://localhost:3000/api/x/callback",
    }),
  );
  await t.run((ctx) => claimXLink(ctx, user, "state"));
  vi.setSystemTime(Date.now() + xLinkProcessingTtlMs);
  await expectApiError(
    () => t.run((ctx) => finishXLink(ctx, user, attemptId, link)),
    "invalid_state",
  );
  expect(await t.run((ctx) => ctx.db.query("xAccounts").first())).toBeNull();
});

test("a new start invalidates an already claimed completion", async () => {
  const t = convexTest(schema, modules);
  const creatorId = await seedCreatorId(t, "x_replaced_completion");
  const user = await requireSeededUser(t, "x_replaced_completion");
  const link = await xAccountLinkArgs(creatorId);
  const args = {
    stateHash: "old",
    verifier: "secret",
    redirectUri: "http://localhost:3000/api/x/callback",
  };
  const oldId = await t.run((ctx) => beginXLink(ctx, user, args));
  await t.run((ctx) => claimXLink(ctx, user, "old"));
  const newId = await t.run((ctx) => beginXLink(ctx, user, { ...args, stateHash: "new" }));
  await expectApiError(() => t.run((ctx) => finishXLink(ctx, user, oldId, link)), "invalid_state");
  expect((await t.run((ctx) => ctx.db.get("xLinkAttempts", newId)))?.status).toBe("pending");
});

test("a linking attempt can be claimed only once and clears its stored verifier", async () => {
  const t = convexTest(schema, modules);
  await seedUser(t, { subject: "x_attempt" });
  const user = await requireSeededUser(t, "x_attempt");
  const attemptId = await t.run((ctx) =>
    beginXLink(ctx, user, {
      stateHash: "hashed-state",
      verifier: "private-verifier",
      redirectUri: "http://localhost:3000/api/x/callback",
    }),
  );
  const claim = await t.run((ctx) => claimXLink(ctx, user, "hashed-state"));
  expect(claim).toMatchObject({ attemptId, verifier: "private-verifier" });
  expect((await t.run((ctx) => ctx.db.get("xLinkAttempts", attemptId)))?.verifier).toBeUndefined();
  await expectApiError(
    () => t.run((ctx) => claimXLink(ctx, user, "hashed-state")),
    "invalid_state",
  );
});

test("a disconnect invalidates an in-flight completion", async () => {
  const t = convexTest(schema, modules);
  await seedUser(t, { subject: "x_disconnect" });
  const user = await requireSeededUser(t, "x_disconnect");
  const attemptId = await t.run((ctx) =>
    beginXLink(ctx, user, {
      stateHash: "hashed-state",
      verifier: "private-verifier",
      redirectUri: "http://localhost:3000/api/x/callback",
    }),
  );
  await t.run((ctx) => claimXLink(ctx, user, "hashed-state"));
  await t.run((ctx) => removeOwnXAccount(ctx, user));
  const link = await xAccountLinkArgs(await seedCreatorId(t, "x_disconnect"));
  await expectApiError(
    () => t.run((ctx) => finishXLink(ctx, user, attemptId, link)),
    "invalid_state",
  );
  expect(await t.run((ctx) => ctx.db.query("xAccounts").collect())).toEqual([]);
});

test("expired attempts cannot be claimed and scheduled cleanup removes their secret", async () => {
  const t = convexTest(schema, modules);
  await seedUser(t, { subject: "x_expired_attempt" });
  const user = await requireSeededUser(t, "x_expired_attempt");
  const attemptId = await t.run((ctx) =>
    beginXLink(ctx, user, {
      stateHash: "state",
      verifier: "secret",
      redirectUri: "http://localhost:3000/api/x/callback",
    }),
  );
  await t.run((ctx) => ctx.db.patch("xLinkAttempts", attemptId, { expiresAt: Date.now() - 1 }));
  await expectApiError(() => t.run((ctx) => claimXLink(ctx, user, "state")), "invalid_state");
  await t.run((ctx) => expireXLink(ctx, attemptId));
  expect(await t.run((ctx) => ctx.db.get("xLinkAttempts", attemptId))).toBeNull();
});

test("an old cleanup job does not delete a replacement attempt", async () => {
  const t = convexTest(schema, modules);
  await seedUser(t, { subject: "x_cleanup_replacement" });
  const user = await requireSeededUser(t, "x_cleanup_replacement");
  const args = {
    stateHash: "state",
    verifier: "secret",
    redirectUri: "http://localhost:3000/api/x/callback",
  };
  const oldId = await t.run((ctx) => beginXLink(ctx, user, args));
  const newId = await t.run((ctx) => beginXLink(ctx, user, { ...args, stateHash: "new-state" }));
  await t.run((ctx) => expireXLink(ctx, oldId));
  expect((await t.run((ctx) => ctx.db.get("xLinkAttempts", newId)))?.status).toBe("pending");
});
