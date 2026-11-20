import { WorkOS } from "@workos-inc/node";
import { describe, expect, test } from "vitest";
import { inviteAuthorizeIntent, invitationTokenFrom } from "@/features/auth/lib/invitation-token";

describe("invitationTokenFrom", () => {
  test("reads the parameter WorkOS actually sends", () => {
    expect(invitationTokenFrom(new URLSearchParams("invitation_token=inv_abc123"))).toBe(
      "inv_abc123",
    );
  });

  test.each(["invitationToken", "token"])("also accepts %s", (key) => {
    expect(invitationTokenFrom(new URLSearchParams(`${key}=inv_abc123`))).toBe("inv_abc123");
  });

  test("prefers WorkOS's own parameter when a link carries more than one", () => {
    const params = new URLSearchParams("token=stale&invitation_token=inv_real");
    expect(invitationTokenFrom(params)).toBe("inv_real");
  });

  test("trims surrounding whitespace from a copied link", () => {
    expect(invitationTokenFrom(new URLSearchParams("invitation_token=  inv_abc123  "))).toBe(
      "inv_abc123",
    );
  });

  test.each([
    ["no parameters", ""],
    ["an unrelated parameter", "next=/opportunities"],
    ["an empty token", "invitation_token="],
    ["a whitespace-only token", "invitation_token=%20%20"],
  ])("returns null for %s", (_label, query) => {
    expect(invitationTokenFrom(new URLSearchParams(query))).toBeNull();
  });
});

/**
 * Against the real SDK, because its own validation is what broke in v0.1.1 and
 * a test of our object alone would have agreed with the bug.
 */
describe("inviteAuthorizeIntent", () => {
  const workos = new WorkOS("sk_test_000", { clientId: "client_000" });
  const base = {
    clientId: "client_000",
    redirectUri: "https://example.test/auth/callback",
    state: "state_000",
    codeChallenge: "challenge_000",
    codeChallengeMethod: "S256",
  } as const;

  function authorizeUrl(intent: Record<string, unknown>): string {
    return workos.userManagement.getAuthorizationUrl({ ...intent, ...base } as Parameters<
      typeof workos.userManagement.getAuthorizationUrl
    >[0]);
  }

  test("builds options WorkOS accepts, carrying the token", () => {
    const params = new URL(authorizeUrl(inviteAuthorizeIntent("inv_abc123"))).searchParams;
    expect(params.get("invitation_token")).toBe("inv_abc123");
    expect(params.get("provider")).toBe("authkit");
    expect(params.get("screen_hint")).toBe("sign-up");
  });

  test("the SDK refuses the same request with no provider", () => {
    // v0.1.1 passed exactly this, so the route threw for every invitee.
    expect(() => authorizeUrl({ invitationToken: "inv_abc123", screenHint: "sign-up" })).toThrow(
      /provider/i,
    );
  });

  test("the SDK refuses screenHint unless the provider is authkit", () => {
    expect(() => authorizeUrl({ provider: "GoogleOAuth", screenHint: "sign-up" })).toThrow(
      /screenHint/i,
    );
  });

  test("the PKCE builder would silently drop the token", async () => {
    // Why the route builds its own URL: this variant reads neither
    // invitationToken nor state, so the invitee would reach a sign-up page
    // with no idea which invitation they are accepting.
    const { url } = await workos.userManagement.getAuthorizationUrlWithPKCE({
      ...inviteAuthorizeIntent("inv_abc123"),
      clientId: "client_000",
      redirectUri: "https://example.test/auth/callback",
    });
    expect(new URL(url).searchParams.get("invitation_token")).toBeNull();
  });
});
