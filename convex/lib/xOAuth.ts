import { apiError } from "./errors";
import { X_ACCOUNT_SCOPES } from "../models/xAccounts";

export type XConfig = { clientId: string; clientSecret: string; redirectUri: string };
export type XTokens = {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: number;
  scopes: string[];
};
const requestTimeoutMs = 8_000;

/** Requires backend-only OAuth configuration before beginning a linking flow. */
export function readXConfig(values: {
  X_CLIENT_ID?: string;
  X_CLIENT_SECRET?: string;
  X_REDIRECT_URI?: string;
}): XConfig {
  const {
    X_CLIENT_ID: clientId,
    X_CLIENT_SECRET: clientSecret,
    X_REDIRECT_URI: redirectUri,
  } = values;
  if (!clientId?.trim() || !clientSecret?.trim() || !redirectUri?.trim())
    throw apiError("misconfigured", { reason: "x_oauth_config_missing" });
  let url: URL;
  try {
    url = new URL(redirectUri);
  } catch {
    throw apiError("misconfigured", { reason: "x_redirect_invalid" });
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (
    (url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
    url.pathname !== "/api/x/callback" ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  ) {
    throw apiError("misconfigured", { reason: "x_redirect_invalid" });
  }
  return { clientId, clientSecret, redirectUri };
}

/** Encodes cryptographic bytes using the unpadded URL-safe Base64 alphabet. */
function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Hashes state for storage without retaining the browser-visible state value. */
export async function hashXState(state: string): Promise<string> {
  return base64Url(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(state))),
  );
}

/** Creates independent random state/verifier and an S256 authorization URL. */
export async function createXAuthorization(config: XConfig) {
  const state = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const url = new URL("https://x.com/i/oauth2/authorize");
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: X_ACCOUNT_SCOPES.join(" "),
    state,
    code_challenge: await hashXState(verifier),
    code_challenge_method: "S256",
  }).toString();
  return { url: url.toString(), stateHash: await hashXState(state), verifier };
}

/** Narrows provider JSON before inspecting any untrusted fields. */
function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw apiError("upstream_failure");
  return value as Record<string, unknown>;
}

/** Performs one bounded request, redacting network errors and rejecting redirects. */
async function xRequest(path: string, init: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`https://api.x.com/2/${path}`, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
  } catch {
    throw apiError("upstream_failure");
  }
  if (!response.ok) {
    if (path === "oauth2/token" && response.status === 400)
      throw apiError("invalid_state", { reason: "x_authorization_failed" });
    if (path === "oauth2/token" && response.status === 401)
      throw apiError("misconfigured", { reason: "x_client_rejected" });
    throw apiError("upstream_failure");
  }
  return response;
}

/** Parses JSON without forwarding an upstream payload or error to callers. */
async function xJson(response: Response): Promise<Record<string, unknown>> {
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw apiError("upstream_failure");
  }
  return object(value);
}

/** Builds confidential-client Basic auth and a form-encoded token request. */
function tokenRequest(config: XConfig, fields: Record<string, string>): RequestInit {
  return {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${encodeURIComponent(config.clientId)}:${encodeURIComponent(config.clientSecret)}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(fields).toString(),
  };
}

/** Exchanges a code once; callers must not automatically retry this non-idempotent request. */
export async function exchangeXCode(
  config: XConfig,
  code: string,
  verifier: string,
): Promise<XTokens> {
  const startedAt = Date.now();
  const data = await xJson(
    await xRequest(
      "oauth2/token",
      tokenRequest(config, {
        grant_type: "authorization_code",
        code,
        redirect_uri: config.redirectUri,
        code_verifier: verifier,
      }),
    ),
  );
  if (
    typeof data.access_token !== "string" ||
    !data.access_token.trim() ||
    typeof data.refresh_token !== "string" ||
    !data.refresh_token.trim() ||
    typeof data.token_type !== "string" ||
    data.token_type.toLowerCase() !== "bearer" ||
    typeof data.expires_in !== "number" ||
    !Number.isSafeInteger(data.expires_in) ||
    data.expires_in <= 0 ||
    typeof data.scope !== "string"
  ) {
    throw apiError("upstream_failure");
  }
  const scopes = data.scope.split(/\s+/).filter(Boolean);
  if (!X_ACCOUNT_SCOPES.every((scope) => scopes.includes(scope)))
    throw apiError("invalid_state", { reason: "x_scopes_missing" });
  const accessTokenExpiresAt = startedAt + data.expires_in * 1000;
  if (!Number.isSafeInteger(accessTokenExpiresAt)) throw apiError("upstream_failure");
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    accessTokenExpiresAt,
    scopes,
  };
}

/** Identifies the authorized X user from the provider, never client profile claims. */
export async function getXIdentity(
  accessToken: string,
): Promise<{ xUserId: string; username: string; displayName: string }> {
  const response = await xJson(
    await xRequest("users/me", { headers: { Authorization: `Bearer ${accessToken}` } }),
  );
  const data = object(response.data);
  if (
    typeof data.id !== "string" ||
    !/^\d+$/.test(data.id) ||
    typeof data.username !== "string" ||
    !data.username.trim() ||
    typeof data.name !== "string" ||
    !data.name.trim()
  )
    throw apiError("upstream_failure");
  return { xUserId: data.id, username: data.username, displayName: data.name };
}

/** Revokes a retained token using the same confidential-client authentication. */
export async function revokeXToken(config: XConfig, token: string): Promise<void> {
  await xRequest("oauth2/revoke", tokenRequest(config, { token }));
}
