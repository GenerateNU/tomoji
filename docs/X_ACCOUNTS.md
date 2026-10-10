# X account linking

This document describes the backend connection contract for issue
[#79](https://github.com/GenerateNU/tomoji/issues/79). X is a linked creator account,
not a Tomoji sign-in provider. WorkOS remains responsible for Tomoji identity.

## Foundation implemented here

- `xAccounts` stores provider-verified account metadata. There is at most one
  account per creator and one creator per X user ID. Indexed ownership checks and
  writes run in the same mutation; indexes alone are not uniqueness constraints.
- `xAccountCredentials` stores the access token, refresh token, actual granted
  scopes, access-token expiry, and credential version separately from profile data.
- `api.xAccounts.me({})` returns an explicit metadata allowlist, or `null` when
  there is no connection. Only active creators can call it.
- `saveXAccount` is a model helper, not a public mutation. Only a server-side OAuth
  completion flow that has verified ownership may supply its account/token payload.
  It replaces credentials atomically and increments their version on reconnect.

The foundation adds new tables without changing existing creator fields. Legacy
`creators.xId` values are not imported or treated as verified connections. Removing
manual `xId` editing and updating its response contract belong in the follow-up.

## Credential handling

Tokens have **no application-level encryption**, by product decision. Internal
function boundaries protect against client access, not a database export or a
privileged dashboard user. Restrict database/export access, redact integration
errors, and never include tokens in logs, URLs, or public return values.

The token expiry is computed from the provider's returned `expires_in` during
exchange, not from a hardcoded lifetime. Do not invent a refresh-token expiration
if the provider does not return one. Store X IDs as strings, never JS numbers.

## Follow-up: OAuth flow and configuration

The next PR adds start/complete/remove operations, expiring single-use PKCE attempts,
a callback separate from WorkOS, provider exchange/lookup/revocation calls, and tests.
The callback must complete under the same authenticated creator who started the
attempt. A failed reconnect must leave the existing connection untouched.

Use OAuth 2.0 authorization-code flow with `S256` PKCE. X's
[authentication mapping](https://docs.x.com/fundamentals/authentication/guides/v2-authentication-mapping)
lists `tweet.read` and `users.read` for user lookup. Request `offline.access` too
to obtain a refresh token, but no write scopes. For a confidential web client,
token exchange/refresh/revocation use HTTP Basic client authentication and
form-encoded bodies. Identify the account through `GET https://api.x.com/2/users/me`,
not a client-supplied username or ID. See X's
[OAuth guide](https://docs.x.com/fundamentals/authentication/oauth-2-0/user-access-token)
and [account lookup](https://docs.x.com/x-api/users/get-my-user).

No X environment variables or credentials are required for this foundation. The
follow-up will declare/configure backend-only `X_CLIENT_ID`, `X_CLIENT_SECRET`, and
`X_REDIRECT_URI`, with exact registered callback URLs for dev and prod. Pulling code
does not provision an X app or configure any deployment.

## Later X API consumers

No periodic token-refresh job is introduced by this ticket. Before adding ongoing
X requests, implement one shared internal on-demand credential helper with a
bounded refresh lease and version-checked commits. A stale refresh result must not
overwrite a reconnect or restore a removed connection. Save a replacement refresh
token with the new access token when the provider supplies one.

Definitive refresh-token rejection means `reconnect_required`, removal of unusable
credentials, and a new user authorization flow. Ordinary access-token expiry does
not disconnect the account. Network failures, rate limits, and provider outages
are temporary errors. A token exchange that succeeds upstream but fails to persist
locally is an ambiguous outcome; do not blindly repeat it. Future consumers must
handle this recovery case and may require reconnection.
