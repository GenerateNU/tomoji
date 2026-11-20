/**
 * The invitation token in an invite link, or null if there isn't one.
 *
 * WorkOS sends `invitation_token`; the others are accepted because the link is
 * built by WorkOS rather than by us, and arriving with a token we refuse to
 * read is the failure the invite route exists to prevent.
 *
 * Kept apart from the route plumbing so it stays free of Next and WorkOS
 * imports, the same way `safeNext` is.
 */
export function invitationTokenFrom(params: URLSearchParams): string | null {
  for (const key of ["invitation_token", "invitationToken", "token"]) {
    const value = params.get(key)?.trim();
    if (value) return value;
  }
  return null;
}

/**
 * What an invitation hand-off asks WorkOS for.
 *
 * `provider: "authkit"` is required twice over: the SDK rejects a request with
 * no provider, connection or organization, and it allows `screenHint` only for
 * authkit. It is also what we want — the hosted AuthKit page is the thing that
 * can take a password from someone who has none yet.
 *
 * Kept here, apart from the route plumbing, so the shape the SDK has to accept
 * can be tested without pulling in Next.
 */
export function inviteAuthorizeIntent(invitationToken: string) {
  return { provider: "authkit", invitationToken, screenHint: "sign-up" } as const;
}
