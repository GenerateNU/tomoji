import { describe, expect, test } from "vitest";
import { invitationTokenFrom } from "@/features/auth/lib/invitation-token";

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
