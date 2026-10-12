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
connection and is not imported. Removing manual editing belongs in the OAuth follow-up.

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

## OAuth follow-up

PR #93 adds start/complete/remove operations and an X callback separate from WorkOS.
It must be updated to encrypt before its linking mutation and decrypt for server-side
provider calls. Its current plaintext contract is incompatible with this foundation:
do not merge or deploy the stack until it is updated.

PKCE attempts must expire, be single-use, and complete under the creator who started
them. Failed reconnects must preserve the existing connection.

Use OAuth 2.0 authorization-code flow with `S256` PKCE. X's
[authentication mapping](https://docs.x.com/fundamentals/authentication/guides/v2-authentication-mapping)
lists `tweet.read` and `users.read` for user lookup. Request `offline.access` too
to obtain a refresh token, but no write scopes. For a confidential web client,
token exchange/refresh/revocation use HTTP Basic client authentication and
form-encoded bodies. Identify the account through `GET https://api.x.com/2/users/me`,
not a client-supplied username or ID. See X's
[OAuth guide](https://docs.x.com/fundamentals/authentication/oauth-2-0/user-access-token)
and [account lookup](https://docs.x.com/x-api/users/get-my-user).

The follow-up requires backend-only `X_CLIENT_ID`, `X_CLIENT_SECRET`, and
`X_REDIRECT_URI`, with exact registered dev/prod callback URLs. These must be
configured separately from pulling the code.

## Later X API consumers

This ticket does not add periodic refresh. Future consumers should share an
on-demand helper with a bounded refresh lease and version-checked writes, so stale
results cannot overwrite reconnects or restore removed connections. Persist any
replacement refresh token together with the new access token.

Access-token expiry does not disconnect the account. Definitive refresh-token
rejection requires reconnection and removal of unusable credentials. Network errors,
rate limits, and outages are temporary failures. If exchange succeeds but persistence
fails, reconcile that ambiguous outcome rather than blindly retrying.
