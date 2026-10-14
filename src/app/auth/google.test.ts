import { beforeEach, expect, test, vi } from "vitest";
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

const { GET: start } = await import("./google/route");
const { GET: callback } = await import("./callback/route");

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

test("starting sends the user straight to Google, returning to the registered callback", async () => {
  userManagement.getAuthorizationUrlWithPKCE.mockResolvedValue({
    url: "https://api.workos.com/user_management/authorize?provider=GoogleOAuth",
    state: "state_1",
    codeVerifier: "verifier_1",
  });

  const response = await start();

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
});

test("a callback matching our Google attempt saves the session and goes home", async () => {
  const session = { user: { id: "user_1" }, accessToken: "a", refreshToken: "r" };
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

test("callbacks that aren't ours go to AuthKit untouched", async () => {
  const withoutCookie = callbackRequest("code=code_1&state=authkit_state", null);
  expect(await (await callback(withoutCookie)).text()).toBe("handled by AuthKit");

  // A stale Google cookie doesn't capture an AuthKit sign-in with different state.
  const staleCookie = callbackRequest("code=code_1&state=authkit_state");
  expect(await (await callback(staleCookie)).text()).toBe("handled by AuthKit");

  expect(userManagement.authenticateWithCode).not.toHaveBeenCalled();
});

test("cancelling at Google returns to log in", async () => {
  const response = await callback(callbackRequest("error=access_denied&state=state_1"));
  expect(response.headers.get("location")).toBe("http://localhost:3000/login?error=google");
  expect(userManagement.authenticateWithCode).not.toHaveBeenCalled();
});

test("a failed exchange returns to log in and never leaks the code", async () => {
  userManagement.authenticateWithCode.mockRejectedValue(
    new OauthException(400, "req_7", "invalid_grant", "bad code", {}),
  );
  const response = await callback(callbackRequest("code=secret-code&state=state_1"));
  expect(response.headers.get("location")).toBe("http://localhost:3000/login?error=google");
  expect(saveSession).not.toHaveBeenCalled();
  expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("secret-code");
});
