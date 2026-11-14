# X account linking

Backend contract for [issue #79](https://github.com/GenerateNU/tomoji/issues/79).
X links to a creator profile. WorkOS still handles Tomoji sign-in.

## Storage and API

- `xAccounts`: verified account metadata, unique per creator and X user ID.
  The mutation enforces uniqueness through indexed checks and writes, not the indexes alone.
- `xAccountCredentials`: encrypted access/refresh token pair, IV, key version,
  granted scopes, access-token expiry, and credential version. Kept separate from profiles.
- `api.xAccounts.me({})`: allowlisted metadata for the active creator, or `null` if unlinked.
- `upsertXAccount`: internal model helper accepting a verified account and encrypted
  credentials. Writes both atomically and increments the credential version on reconnect.

Store X IDs as strings. Derive access-token expiry from the provider's `expires_in`;
do not invent a refresh-token expiration. Legacy `creators.xId` is not a verified
connection and is not imported. `creators.update` no longer accepts `xId`; profile
reads derive it from `xAccounts`. Check every deployment for legacy values before
removing the optional schema field.

| Operation                                       | Caller              | Result                                         |
| ----------------------------------------------- | ------------------- | ---------------------------------------------- |
| `xAccounts.start({})`                           | Active creator      | `authorizationUrl`, conservative `expiresAt`   |
| `xAccounts.complete({ state, code?, denied? })` | Same active creator | Safe connected-account metadata                |
| `xAccounts.me({})`                              | Active creator      | Safe metadata, or `null`                       |
| `xAccounts.remove({})`                          | Active creator      | `revocation: complete \| failed \| not_needed` |

Completion accepts only callback state/code (or denial), never user IDs, X profile
claims, or tokens. All token-bearing database operations are internal.

## Token encryption

AES-256-GCM encrypts both tokens together with a fresh 12-byte IV and 128-bit
authentication tag. Creator ID and key version are authenticated additional data.
Keys live in backend-only Convex deployment secrets, separate from database exports.
Someone with access to both can still decrypt credentials. Never expose tokens or
keys in logs, URLs, or public responses.

Call `encryptXTokens` in an action before persistence: mutations cannot use
cryptographic randomness. `upsertXAccount` accepts only an `encryptedTokens` envelope.
Use `decryptXTokens` only for authorized server-side provider calls. Invalid keys,
configuration, or ciphertext fail closed with redacted errors.

### Setup and rotation

Generate a key map containing a random 32-byte, standard Base64-encoded key:

```bash
bun -e 'console.log(JSON.stringify({v1: Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64")}))'
```

Save the secret output as `X_TOKEN_ENCRYPTION_KEYS` in `.env.local`, set
`X_TOKEN_ENCRYPTION_KEY_VERSION=v1`, then run `just convex-env` for personal dev.
The script requires both settings together. Blank settings are skipped so unrelated
features can deploy, but storing credentials requires valid encryption configuration.
CI does not provision keys. Use separate production keys and explicit deployment approval.

To rotate, add a new key to the map and select its version for new writes. Reads
use each credential's stored version. Keep old keys until those credentials are
re-encrypted or removed. Rotation and plaintext-data conversion are not automated;
check existing data before deployment and approve any conversion or reconnection rollout.

## OAuth flow

The frontend calls `start` and navigates to its authorization URL. X redirects to
`GET /api/x/callback`. This Next.js handler reads the existing WorkOS session and
immediately calls `complete` using that session's access token. The callback is
separate from `/auth/callback` and cannot create a Tomoji session.

State is cryptographically random and stored only as a SHA-256 hash. The independent
PKCE verifier stays in a server-only `xLinkAttempts` row, never a cookie or browser
response. Pending callbacks expire after 10 minutes. Claiming removes the stored
verifier and starts a separate 60-second processing window for exchange and persistence.
Scheduled cleanup respects that window and deletes abandoned attempts without a table scan.
Only the same active creator can claim or complete an attempt. A new start or disconnect
invalidates older/in-flight attempts, and completion rechecks ownership and processing expiry.

The completion action encrypts both tokens before its internal persistence mutation.
Disconnect returns only encrypted credentials internally and decrypts them in the
action for revocation. Missing keys or invalid ciphertext cannot block local disconnect.

A failed reconnect leaves the old account/credentials untouched. Authorization
codes are exchanged once, with no automatic retry. X documents a 30-second code
lifetime, so the callback must not wait for another frontend step. Network failure
during exchange or persistence can be ambiguous: check `me` before starting a fresh
flow rather than replaying the callback. An unpersisted grant may still exist on X.

The callback redirects to `/?x_link=connected|failed|denied|sign_in_required|already_linked`, with
`Cache-Control: no-store` and `Referrer-Policy: no-referrer`. No provider payload,
code, state, or token appears in that redirect. Signed-out callbacks require a new
linking attempt after signing in. Settings currently shows only a disabled **Connect X**
placeholder; it is not wired to this backend. Future connection controls should provide
result messages and use `me` as the source of truth after returning.
`already_linked` identifies only the specific account-ownership conflict, without
exposing the other creator's identity. Other errors stay generic.

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
Live linking must be verified with a real X app before release. Linking includes no
posting, analytics, token-refresh service, or ingestion; post metrics are covered below.

## Post metrics sync configuration

Post metrics come from X's public post lookup, which accepts the app-only bearer
token, so the sync never decrypts creator credentials. Every read is billed against
the team's X credits.

Nothing calls the lookup yet: no cron runs and no post's counts are updated. The weekly
fetch will run inside the payout cron, before payouts are calculated. The X field names
below come from X's documentation and haven't been checked against a live response.
Before enabling the sync anywhere, make one lookup for a post you own (about $0.005)
and confirm `public_metrics` includes `impression_count`:

```bash
curl -s -H "Authorization: Bearer $X_BEARER_TOKEN" "https://api.x.com/2/tweets?ids=<post_id>&tweet.fields=public_metrics"
```

| Setting                  | Meaning                                                       |
| ------------------------ | ------------------------------------------------------------- |
| `X_BEARER_TOKEN`         | App bearer token from the X Developer Console. Backend-only.  |
| `X_METRICS_SYNC_ENABLED` | Exactly `true` enables the sync. Anything else leaves it off. |

`readXMetricsConfig` in `convex/lib/xApi.ts` reads both. With the flag off it reports
the sync disabled without checking the token. With the flag on and no token it fails
closed as `misconfigured`. Keep the flag off on personal deployments. `just convex-env`
copies each setting that is filled in and rejects `X_METRICS_SYNC_ENABLED=true` without a
token, but it never clears a deployment value. To turn an enabled deployment off, run
`bunx convex env set X_METRICS_SYNC_ENABLED false`.

`X_POST_EARNING_DAYS` (30) is the default duration from the original live-post
verification, not publication. The stored earnings agreement determines the actual
window; cancellation or confirmed removal can shorten it. Earnings are calculated
every seven days, with a final partial period ending exactly at day 30 rather than
the end of that week. Collectors must use the agreement's verification baseline
and period/cutoff timestamps, and retain delayed evidence needed to settle earlier
earnings. See [Earnings rules](EARNINGS.md) for the calculation and evidence contract.

`X_POST_EARNING_DAYS` (30) is a placeholder for how long a post keeps earning after it
goes live, pending product confirmation. The sync runs daily at 00:00 UTC and reads
posts that went live within the last `X_POST_EARNING_DAYS` + 1 day. The extra day keeps a
post in the first run after its last earning day, which stores its final total, so
payouts cover the post through day 30. If that run fails, the post keeps the previous
day's total. `posts.listEarning` (internal) returns those verified, active posts a page
at a time.

`getXPostMetrics` looks up at most 100 post IDs per call through `GET /2/tweets` with
`tweet.fields=public_metrics`. Each post's counts come back in two parts, stored
separately:

| Part         | X fields                                                    | Stored by                | Used for  |
| ------------ | ----------------------------------------------------------- | ------------------------ | --------- |
| `views`      | `impression_count`                                          | `posts.updateViews`      | Payouts   |
| `engagement` | `like_count`, `reply_count`, `retweet_count`, `quote_count` | `posts.updateEngagement` | Analytics |

`posts.updateViews` also records `viewsUpdatedAt`. Engagement maps to `likes`,
`comments`, `reposts`, and `quotes`; quote posts are their own count and are never
added to `reposts`. An unusable engagement count is left out on its own, keeping its
stored value, so it can never hold back the views or the other counts.

One unusable post never fails the batch. Each such post is listed in `missing` with a
reason:

| Reason           | Meaning                                                                       |
| ---------------- | ----------------------------------------------------------------------------- |
| `invalid_id`     | Not X's id format (1–19 digits, no leading zero), so it was never sent.       |
| `not_found`      | X reports the post doesn't exist, usually because it was deleted.             |
| `not_authorized` | X reports the post is protected or otherwise not visible to the app.          |
| `not_returned`   | X left the post out without a reason we recognize; it may come back next run. |
| `malformed`      | X returned the post, but its views were missing or not a whole number.        |

Error types X doesn't document are logged with the post ID and the type, so a change in
X's error format shows up in the logs instead of silently becoming `not_returned`.

An empty, oversized (over 100), or duplicated id list is a caller bug and fails as
`invalid_state`. A response containing a post that wasn't requested, or the same post
twice, can't be trusted for any post and fails as `upstream_failure`. HTTP 429 fails as
`upstream_failure` with reason `x_rate_limited`, plus `retryAt` (Unix ms) when X's
`x-rate-limit-reset` header gives one; every other failure is a redacted
`upstream_failure`. `xOAuth.ts` shares the same request helpers from `xApi.ts`.

## Later X API consumers

This ticket does not add periodic refresh. Future consumers should share an
on-demand helper with a bounded refresh lease and version-checked writes, so stale
results cannot overwrite reconnects or restore removed connections. Persist any
replacement refresh token together with the new access token.

Access-token expiry does not disconnect the account. Definitive refresh-token
rejection requires reconnection and removal of unusable credentials. Network errors,
rate limits, and outages are temporary failures. If exchange succeeds but persistence
fails, reconcile that ambiguous outcome rather than blindly retrying.
