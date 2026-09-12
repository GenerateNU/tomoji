/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");

describe("me", () => {
  test("returns null when signed out", async () => {
    const t = convexTest(undefined, modules);
    await expect(t.query(api.users.me, {})).resolves.toBeNull();
  });

  test("returns the caller's identity when signed in", async () => {
    const t = convexTest(undefined, modules);
    const asUser = t.withIdentity({
      subject: "user_123",
      issuer: "https://api.workos.com/user_management/client_test",
      email: "creator@example.com",
    });

    const result = await asUser.query(api.users.me, {});

    expect(result).not.toBeNull();
    expect(result?.subject).toBe("user_123");
    expect(result?.email).toBe("creator@example.com");
  });

  test("reports no org when the token carries no org_id", async () => {
    const t = convexTest(undefined, modules);
    const asUser = t.withIdentity({ subject: "user_123" });

    const result = await asUser.query(api.users.me, {});

    expect(result?.orgId).toBeNull();
  });
});

describe("requireMe", () => {
  // The deny case. A code review will not catch an inverted comparison here,
  // so it gets its own test.
  test("rejects a signed-out caller", async () => {
    const t = convexTest(undefined, modules);
    await expect(t.query(api.users.requireMe, {})).rejects.toThrow("Not authenticated");
  });

  test("allows a signed-in caller", async () => {
    const t = convexTest(undefined, modules);
    const asUser = t.withIdentity({ subject: "user_123" });

    await expect(asUser.query(api.users.requireMe, {})).resolves.toEqual({
      subject: "user_123",
    });
  });
});
