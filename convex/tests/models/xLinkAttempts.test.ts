/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import {
  beginXLink,
  claimXLink,
  expireXLink,
  finishXLink,
  removeOwnXAccount,
} from "../../models/xLinkAttempts";
import schema from "../../schema";
import { expectApiError, seedUser, xAccountLinkArgs, requireSeededUser } from "../helpers";

const modules = import.meta.glob("../../**/*.ts");

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
  await expectApiError(
    () => t.run((ctx) => finishXLink(ctx, user, attemptId, xAccountLinkArgs())),
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
