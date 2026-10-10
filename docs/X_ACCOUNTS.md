# X account linking

This document describes the backend connection contract for issue
[#79](https://github.com/GenerateNU/tomoji/issues/79). X is a linked creator account,
not a Tomoji sign-in provider. WorkOS remains responsible for Tomoji identity.

## Storage and public operations

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

`creators.update` no longer accepts `xId`. Profile reads (`me`, `get`, `list`, and
the update result) derive `xId` from the verified `xAccounts` row. Legacy
`creators.xId` values are retained for additive schema compatibility but ignored,
not imported as verified connections. No migration is needed for this additive
schema. Check all deployments for legacy values before removing the optional field.

| Operation                                       | Caller              | Result                                         |
| ----------------------------------------------- | ------------------- | ---------------------------------------------- |
| `xAccounts.start({})`                           | Active creator      | `authorizationUrl`, conservative `expiresAt`   |
| `xAccounts.complete({ state, code?, denied? })` | Same active creator | Safe connected-account metadata                |
| `xAccounts.me({})`                              | Active creator      | Safe metadata, or `null`                       |
| `xAccounts.remove({})`                          | Active creator      | `revocation: complete \| failed \| not_needed` |

Completion accepts only callback state/code (or denial), never user IDs, X profile
claims, or tokens. All token-bearing database operations are internal.

## Credential handling

Tokens have **no application-level encryption**, by product decision. Internal
function boundaries protect against client access, not a database export or a
privileged dashboard user. Restrict database/export access, redact integration
errors, and never include tokens in logs, URLs, or public return values.

The token expiry is computed from the provider's returned `expires_in` during
exchange, not from a hardcoded lifetime. Do not invent a refresh-token expiration
if the provider does not return one. Store X IDs as strings, never JS numbers.

## OAuth flow

The frontend calls `start` and navigates to its authorization URL. X redirects to
`GET /api/x/callback`. This Next.js handler reads the existing WorkOS session and
immediately calls `complete` using that session's access token. The callback is
separate from `/auth/callback` and cannot create a Tomoji session.

State is cryptographically random and stored only as a SHA-256 hash. The independent
PKCE verifier stays in a server-only `xLinkAttempts` row, never a cookie or browser
response. One pending attempt per creator expires after 10 minutes. A scheduled
internal mutation deletes its temporary material without a table scan. Completion
atomically claims the attempt and removes the stored verifier before contacting X.
Only the same active creator can claim it. A new start or disconnect invalidates
older/in-flight attempts, and commit rechecks ownership and expiry.

A failed reconnect leaves the old account/credentials untouched. Authorization
codes are exchanged once, with no automatic retry. X documents a 30-second code
lifetime, so the callback must not wait for another frontend step. Network failure
during exchange or persistence can be ambiguous: check `me` before starting a fresh
flow rather than replaying the callback. An unpersisted grant may still exist on X.

The callback redirects to `/?x_link=connected|failed|denied|sign_in_required`, with
`Cache-Control: no-store` and `Referrer-Policy: no-referrer`. No provider payload,
code, state, or token appears in that redirect. Signed-out callbacks require a new
linking attempt after signing in. TODO for FE: provide the connect/disconnect buttons
and result messages, and use `me` as the source of truth after returning.

Disconnect invalidates attempts and deletes local account/credential rows first,
then attempts revocation of both tokens with bounded requests. Even when X is down
or configuration is missing, the local disconnect succeeds. `revocation: failed`
means upstream access could remain authorized. Ask the user to revoke Tomoji in
[X connected apps](https://x.com/settings/connected_apps) if they need confirmation.
No background service or automatic revocation retry is introduced.

Use OAuth 2.0 authorization-code flow with `S256` PKCE. X's
[authentication mapping](https://docs.x.com/fundamentals/authentication/guides/v2-authentication-mapping)
lists `tweet.read` and `users.read` for user lookup. Request `offline.access` too
to obtain a refresh token, but no write scopes. For a confidential web client,
token exchange/refresh/revocation use HTTP Basic client authentication and
form-encoded bodies. Identify the account through `GET https://api.x.com/2/users/me`,
not a client-supplied username or ID. See X's
[OAuth guide](https://docs.x.com/fundamentals/authentication/oauth-2-0/user-access-token)
and [account lookup](https://docs.x.com/x-api/users/get-my-user).

## Configuration and rollout

Configure a confidential **Web App** in the X Developer Console with OAuth 2.0
enabled and the exact callback URL registered. Set backend-only `X_CLIENT_ID`,
`X_CLIENT_SECRET`, and `X_REDIRECT_URI` on each target Convex deployment. Never use
`NEXT_PUBLIC_` for these credentials. Dev uses `http://localhost:3000/api/x/callback`.
Production uses `https://<production-domain>/api/x/callback`. Preview origins need
their own registered callback or a stable configured preview origin. Do not derive
callback URLs from client input or request headers.

For personal dev, fill the three entries in `.env.local` and run `just convex-env`.
That command copies a complete X configuration when credentials are supplied and
rejects a partial configuration before writing any variables. Leaving both X
credentials blank skips X setup. Typed deployment env fields are optional so
unrelated backend features can deploy without an X app, but linking fails closed
unless all three settings are present. Pulling/merging code and CI do not provision
an X app or configure deployment secrets. CI uses synthetic responses and credentials.

This implementation adds one attempt table and changes the editable profile API,
but does not run a migration, configure credentials, or enable X as a sign-in provider.
Live linking must be verified with a real X app before release. No posting, analytics,
token-refresh service, or ingestion is included.

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
