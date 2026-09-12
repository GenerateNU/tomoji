import type { AuthConfig } from "convex/server";

// Set on the Convex deployment, not in .env.local:
//   bunx convex env set WORKOS_CLIENT_ID 'client_...'
//   bunx convex env set WORKOS_CLIENT_ID 'client_...' --prod
const clientId = process.env.WORKOS_CLIENT_ID;

if (!clientId) {
  throw new Error(
    "WORKOS_CLIENT_ID is not set on this Convex deployment. " +
      "Run: bunx convex env set WORKOS_CLIENT_ID 'client_...'",
  );
}

// Two providers because WorkOS mints access tokens with two different `iss`
// shapes. This mirrors the configuration in
// https://docs.convex.dev/auth/authkit — keep both entries.
export default {
  providers: [
    {
      // Tokens issued with the bare API issuer DO carry an `aud` claim, so the
      // audience is verified here in addition to the issuer.
      type: "customJwt",
      issuer: "https://api.workos.com/",
      algorithm: "RS256",
      jwks: `https://api.workos.com/sso/jwks/${clientId}`,
      applicationID: clientId,
    },
    {
      // Tokens issued with the user_management issuer carry no `aud`, so
      // applicationID is omitted. Safe here because this issuer URL already
      // embeds our client id — a token from another WorkOS application has a
      // different `iss` and is rejected.
      type: "customJwt",
      issuer: `https://api.workos.com/user_management/${clientId}`,
      algorithm: "RS256",
      jwks: `https://api.workos.com/sso/jwks/${clientId}`,
    },
  ],
} satisfies AuthConfig;
