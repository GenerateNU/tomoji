import { beforeEach, expect, test, vi } from "vitest";
// Google sign-in is hidden for now (buttons commented out in the auth forms); re-enable these with it.
import { getWorkOS, saveSession } from "@workos-inc/authkit-nextjs";
import { OauthException } from "@workos-inc/node";
import { NextRequest } from "next/server";

const { authkitCallback } = vi.hoisted(() => ({
  authkitCallback: vi.fn(async () => new Response("handled by AuthKit")),
}));
vi.mock("@workos-inc/authkit-nextjs", () => ({
  getWorkOS: vi.fn(),
  saveSession: vi.fn(),
  handleAuth: () => authkitCallback,
}));

const { GET: start } = await import("@/app/auth/google/route");
const { GET: callback } = await import("@/app/auth/callback/route");

const userManagement = {
  getAuthorizationUrlWithPKCE: vi.fn(),
  authenticateWithCode: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("WORKOS_CLIENT_ID", "client_1");
  vi.stubEnv("NEXT_PUBLIC_WORKOS_REDIRECT_URI", "http://localhost:3000/auth/callback");
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(getWorkOS).mockReturnValue({ userManagement } as never);
});

const stored = encodeURIComponent(JSON.stringify({ state: "state_1", codeVerifier: "verifier_1" }));

function callbackRequest(query: string, cookie: string | null = stored) {
  return new NextRequest(`http://localhost:3000/auth/callback?${query}`, {
    headers: cookie ? { cookie: `tomoji-google-oauth=${cookie}` } : {},
  });
}

function storedAttempt(cookie: string) {
  const value = /tomoji-google-oauth=([^;]*)/.exec(cookie)![1];
  return JSON.parse(decodeURIComponent(value));
}

function startRequest(query = "") {
  return new NextRequest(`http://localhost:3000/auth/google${query}`);
}

function mockAuthorizationUrl() {
  userManagement.getAuthorizationUrlWithPKCE.mockResolvedValue({
    url: "https://api.workos.com/user_management/authorize?provider=GoogleOAuth",
    state: "state_1",
    codeVerifier: "verifier_1",
  });
}

test.skip("starting sends the user straight to Google, returning to the registered callback", async () => {
  userManagement.getAuthorizationUrlWithPKCE.mockResolvedValue({
    url: "https://api.workos.com/user_management/authorize?provider=GoogleOAuth",
    state: "state_1",
    codeVerifier: "verifier_1",
  });

  const response = await start(startRequest());

  expect(userManagement.getAuthorizationUrlWithPKCE).toHaveBeenCalledWith({
    provider: "GoogleOAuth",
    clientId: "client_1",
    redirectUri: "http://localhost:3000/auth/callback",
  });
  expect(response.headers.get("location")).toBe(
    "https://api.workos.com/user_management/authorize?provider=GoogleOAuth",
  );
  const cookie = response.headers.get("set-cookie")!;
  expect(cookie).toContain("tomoji-google-oauth=");
  expect(cookie).toContain("HttpOnly");
  expect(cookie).toContain("Path=/auth");
  expect(storedAttempt(cookie)).toEqual({
    state: "state_1",
    codeVerifier: "verifier_1",
    next: "/",
  });
});

test.skip("starting remembers where the user was headed", async () => {
  mockAuthorizationUrl();
  const response = await start(startRequest("?next=%2Fcampaigns%2Fabc"));
  expect(storedAttempt(response.headers.get("set-cookie")!).next).toBe("/campaigns/abc");
});

test.skip("starting ignores an off-site next", async () => {
  mockAuthorizationUrl();
  const response = await start(startRequest("?next=https%3A%2F%2Fevil.com"));
  expect(storedAttempt(response.headers.get("set-cookie")!).next).toBe("/");
});

test.skip("a callback returns the user to where they were headed", async () => {
  userManagement.authenticateWithCode.mockResolvedValue({
    user: { id: "user_1" },
  });
  const cookie = encodeURIComponent(
    JSON.stringify({
      state: "state_1",
      codeVerifier: "verifier_1",
      next: "/campaigns/abc",
    }),
  );

  const response = await callback(callbackRequest("code=code_1&state=state_1", cookie));

  expect(response.headers.get("location")).toBe("http://localhost:3000/campaigns/abc");
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("set-cookie")).toContain("tomoji-google-oauth=;");
});

test.skip("a callback with a tampered next in the cookie goes home", async () => {
  userManagement.authenticateWithCode.mockResolvedValue({
    user: { id: "user_1" },
  });
  const cookie = encodeURIComponent(
    JSON.stringify({
      state: "state_1",
      codeVerifier: "verifier_1",
      next: "//evil.com",
    }),
  );

  const response = await callback(callbackRequest("code=code_1&state=state_1", cookie));

  expect(response.headers.get("location")).toBe("http://localhost:3000/");
});

test.skip("a callback matching our Google attempt saves the session and goes home", async () => {
  const session = {
    user: { id: "user_1" },
    accessToken: "a",
    refreshToken: "r",
  };
  userManagement.authenticateWithCode.mockResolvedValue(session);

  const response = await callback(callbackRequest("code=code_1&state=state_1"));

  expect(userManagement.authenticateWithCode).toHaveBeenCalledWith({
    clientId: "client_1",
    code: "code_1",
    codeVerifier: "verifier_1",
  });
  expect(saveSession).toHaveBeenCalledWith(session, expect.anything());
  expect(response.headers.get("location")).toBe("http://localhost:3000/");
  expect(response.headers.get("set-cookie")).toContain("tomoji-google-oauth=;");
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(authkitCallback).not.toHaveBeenCalled();
});

test.skip("callbacks that aren't ours go to AuthKit untouched", async () => {
  const withoutCookie = callbackRequest("code=code_1&state=authkit_state", null);
  expect(await (await callback(withoutCookie)).text()).toBe("handled by AuthKit");

  // A stale Google cookie doesn't capture an AuthKit sign-in with different state.
  const staleCookie = callbackRequest("code=code_1&state=authkit_state");
  expect(await (await callback(staleCookie)).text()).toBe("handled by AuthKit");

  expect(userManagement.authenticateWithCode).not.toHaveBeenCalled();
});

test.skip("cancelling at Google returns to log in", async () => {
  const response = await callback(callbackRequest("error=access_denied&state=state_1"));
  expect(response.headers.get("location")).toBe("http://localhost:3000/login?error=google");
  expect(userManagement.authenticateWithCode).not.toHaveBeenCalled();
});

test.skip("a failed exchange returns to log in and never leaks the code", async () => {
  userManagement.authenticateWithCode.mockRejectedValue(
    new OauthException(400, "req_7", "invalid_grant", "bad code", {}),
  );
  const response = await callback(callbackRequest("code=secret-code&state=state_1"));
  expect(response.headers.get("location")).toBe("http://localhost:3000/login?error=google");
  expect(saveSession).not.toHaveBeenCalled();
  expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("secret-code");
});
