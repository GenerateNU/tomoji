/**
 * Catches emails that are well-formed but almost certainly mistyped, like
 * `@gmail.con`, so sign-up doesn't create an account nobody can verify.
 *
 * An explicit list rather than "within one letter of a known domain": real
 * providers sit that close together (mail.com vs gmail.com).
 */

// None of these are real top-level domains.
const COM_TYPOS = ["con", "cmo", "ocm", "comm", "vom", "xom", "coom"];

const PROVIDER_TYPOS: Record<string, string> = {
  "gmial.com": "gmail.com",
  "gmai.com": "gmail.com",
  "gamil.com": "gmail.com",
  "gnail.com": "gmail.com",
  "gmaill.com": "gmail.com",
  "hotmial.com": "hotmail.com",
  "hotmai.com": "hotmail.com",
  "yaho.com": "yahoo.com",
  "yahooo.com": "yahoo.com",
  "outlok.com": "outlook.com",
  "outloo.com": "outlook.com",
  "iclod.com": "icloud.com",
};

/** The corrected address, or null when the domain doesn't look like a typo. */
export function suggestEmail(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at === -1) return null;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1).toLowerCase();

  const dot = domain.lastIndexOf(".");
  const ending = domain.slice(dot + 1);
  const withCom = COM_TYPOS.includes(ending) ? `${domain.slice(0, dot)}.com` : domain;
  const fixed = PROVIDER_TYPOS[withCom] ?? withCom;

  return fixed === domain ? null : `${local}@${fixed}`;
}
