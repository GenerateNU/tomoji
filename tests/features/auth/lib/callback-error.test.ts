import { NextRequest } from "next/server";
import { beforeEach, expect, test, vi } from "vitest";
import { authKitFailure, signInNotice } from "@/features/auth/lib/callback-error";

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

/** The shape AuthKit's own `CallbackError` hands to `onError`. */
function callbackError(code: string) {
  return Object.assign(new Error("Sign-in session could not be verified."), {
    name: "CallbackError",
    code,
  });
}

function callbackRequest(query: string) {
  return new NextRequest(`http://localhost:3000/auth/callback?${query}`);
}

test("a failed callback returns to the ordinary log in page, not an error page", async () => {
  const response = await authKitFailure({
    error: new Error("missing pkce cookie"),
    request: callbackRequest("code=code_1&state=state_1"),
  });

  expect(response.status).toBe(307);
  expect(response.headers.get("location")).toBe("http://localhost:3000/login");
});

test("a failed callback is never cached or referred onward", async () => {
  const response = await authKitFailure({
    error: new Error("boom"),
    request: callbackRequest("code=code_1"),
  });

  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
});

// `code` is a live credential, so it must not reach the logs or the URL.
test("a failed callback never leaks the authorization code", async () => {
  const response = await authKitFailure({
    error: new Error("boom"),
    request: callbackRequest("code=secret-code&state=secret-state"),
  });

  expect(response.headers.get("location")).not.toContain("secret-code");
  expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("secret-code");
});

test("a failed callback logs the reason AuthKit gave", async () => {
  await authKitFailure({
    error: callbackError("missing_pkce_cookie"),
    request: callbackRequest("code=code_1"),
  });

  expect(JSON.stringify(vi.mocked(console.error).mock.calls)).toContain("missing_pkce_cookie");
});

// Accepting an invitation lands here with the account already created, so a
// failure notice would be telling people something untrue.
test("log in says nothing about a failed callback", () => {
  expect(signInNotice("callback")).toBeNull();
});

test("log in still explains a failed Google sign-in", () => {
  expect(signInNotice("google")).toBe("Google sign-in didn't finish. Try again.");
});

test("log in shows no notice for an unknown or absent reason", () => {
  expect(signInNotice(undefined)).toBeNull();
  expect(signInNotice("whatever")).toBeNull();
  expect(signInNotice(["callback"])).toBeNull();
});
