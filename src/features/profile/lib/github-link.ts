type GithubLinkResult = { ok: true; value: string | null } | { ok: false; error: string };

/** Also used when rendering older saved values, which the API does not URL-validate. */
export function parseGithubLink(input: string): GithubLinkResult {
  const value = input.trim();
  if (!value) return { ok: true, value: null };

  try {
    const url = new URL(/^(www\.)?github\.com\//i.test(value) ? `https://${value}` : value);
    if (
      url.protocol === "https:" &&
      (url.hostname === "github.com" || url.hostname === "www.github.com") &&
      !url.username &&
      !url.password &&
      !url.port &&
      url.pathname !== "/"
    ) {
      return { ok: true, value: url.href };
    }
  } catch {
    // Invalid URLs share the same actionable field message as unsupported URLs.
  }

  return { ok: false, error: "Enter a GitHub URL, such as https://github.com/username." };
}
