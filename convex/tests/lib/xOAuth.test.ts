import { afterEach, expect, test, vi } from "vitest";
import {
  createXAuthorization,
  exchangeXCode,
  getXIdentity,
  hashXState,
  readXConfig,
} from "../../lib/xOAuth";
import { expectApiError, xTokenResponse } from "../helpers";

const config = {
  clientId: "test-client",
  clientSecret: "test-secret",
  redirectUri: "http://localhost:3000/api/x/callback",
};
afterEach(() => vi.unstubAllGlobals());

test("authorization uses S256 without exposing its verifier", async () => {
  const authorization = await createXAuthorization(config);
  const url = new URL(authorization.url);
  expect(url.origin + url.pathname).toBe("https://x.com/i/oauth2/authorize");
  expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  expect(url.searchParams.get("scope")).toBe("tweet.read users.read offline.access");
  expect(authorization.verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(url.toString()).not.toContain(authorization.verifier);
  expect(url.searchParams.get("code_challenge")).toBe(await hashXState(authorization.verifier));
  expect(authorization.stateHash).toBe(await hashXState(url.searchParams.get("state")!));
});

test("missing refresh tokens are rejected instead of storing an incomplete connection", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      Response.json({
        access_token: "access",
        token_type: "bearer",
        expires_in: 7200,
        scope: "tweet.read users.read offline.access",
      }),
    ),
  );
  await expectApiError(() => exchangeXCode(config, "code", "verifier"), "upstream_failure");
});

test("nonpositive token expiry is rejected", async () => {
  const body = await xTokenResponse().json();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ...body, expires_in: -1 })));
  await expectApiError(() => exchangeXCode(config, "code", "verifier"), "upstream_failure");
});

test("required read/offline scopes must actually be granted", async () => {
  const body = await xTokenResponse().json();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(Response.json({ ...body, scope: "users.read" })),
  );
  await expectApiError(() => exchangeXCode(config, "code", "verifier"), "invalid_state");
});

test("a token rejection is redacted and never automatically retried", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response("secret-upstream-error", { status: 400 }));
  vi.stubGlobal("fetch", fetch);
  await expectApiError(() => exchangeXCode(config, "code", "verifier"), "invalid_state");
  expect(fetch).toHaveBeenCalledTimes(1);
});

test("network errors including credential-bearing messages are redacted", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("secret-access-token")));
  await expect(exchangeXCode(config, "code", "verifier")).rejects.toThrow(
    /"code":"upstream_failure"/,
  );
  await expect(exchangeXCode(config, "code", "verifier")).rejects.not.toThrow(
    "secret-access-token",
  );
});

test("malformed JSON and numeric provider IDs are not accepted", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(new Response("not JSON"))
      .mockResolvedValueOnce(Response.json({ data: { id: 123, name: "Ada", username: "ada" } })),
  );
  await expectApiError(() => exchangeXCode(config, "code", "verifier"), "upstream_failure");
  await expectApiError(() => getXIdentity("token"), "upstream_failure");
});

test("configuration fails closed and only permits HTTPS or local HTTP callbacks", () => {
  expect(() => readXConfig({})).toThrow(/x_oauth_config_missing/);
  expect(() =>
    readXConfig({
      X_CLIENT_ID: config.clientId,
      X_CLIENT_SECRET: config.clientSecret,
      X_REDIRECT_URI: "http://example.com/api/x/callback",
    }),
  ).toThrow(/x_redirect_invalid/);
  expect(
    readXConfig({
      X_CLIENT_ID: config.clientId,
      X_CLIENT_SECRET: config.clientSecret,
      X_REDIRECT_URI: config.redirectUri,
    }),
  ).toEqual(config);
});

test("exchange authenticates confidential clients and validates provider tokens", async () => {
  const fetch = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        access_token: "access",
        refresh_token: "refresh",
        token_type: "bearer",
        expires_in: 7200,
        scope: "tweet.read users.read offline.access",
      }),
    ),
  );
  vi.stubGlobal("fetch", fetch);
  const result = await exchangeXCode(config, "auth-code", "verifier");
  expect(result).toMatchObject({
    accessToken: "access",
    refreshToken: "refresh",
    scopes: ["tweet.read", "users.read", "offline.access"],
  });
  const [url, request] = fetch.mock.calls[0];
  expect(url).toBe("https://api.x.com/2/oauth2/token");
  expect(request.headers.Authorization).toBe(`Basic ${btoa("test-client:test-secret")}`);
  expect(new URLSearchParams(request.body).get("code_verifier")).toBe("verifier");
  expect(new URLSearchParams(request.body).get("redirect_uri")).toBe(config.redirectUri);
});
