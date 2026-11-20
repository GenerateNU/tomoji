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
