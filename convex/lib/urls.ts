import { apiError } from "./errors";

export type UrlRules = {
  /** The `invalid_state` reason thrown for anything these rules reject. */
  reason: string;
  /** Hostnames to accept, matching the host itself or any subdomain of it. */
  hosts?: readonly string[];
  /** Accept plain http too, for links pasted from hosts that still serve it. */
  allowHttp?: boolean;
  maxLength?: number;
  /** Reason for exceeding `maxLength`, when it should differ from `reason`. */
  tooLongReason?: string;
};

/**
 * Checks a link someone typed and returns it in parsed form, so what gets
 * stored is exactly what was checked rather than the raw input.
 *
 * Every stored link is eventually rendered as an `href`, so this is what keeps
 * `javascript:` out of the database. Credentials are refused because
 * `https://github.com@evil.test` reads as GitHub but goes to evil.test.
 *
 * @throws `invalid_state` with the caller's `reason`.
 */
export function requireUrl(value: string, rules: UrlRules): string {
  const invalid = () => apiError("invalid_state", { reason: rules.reason });

  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw invalid();
  }
  if (url.protocol !== "https:" && !(rules.allowHttp && url.protocol === "http:")) {
    throw invalid();
  }
  if (url.username !== "" || url.password !== "") {
    throw invalid();
  }
  if (rules.hosts !== undefined && !rules.hosts.some((host) => matchesHost(url.hostname, host))) {
    throw invalid();
  }
  // Encoding can make the URL longer than what was typed, so measure the result.
  if (rules.maxLength !== undefined && url.href.length > rules.maxLength) {
    throw apiError("invalid_state", { reason: rules.tooLongReason ?? rules.reason });
  }
  return url.href;
}

/** True for the host itself or a subdomain, never for `github.com.evil.test`. */
function matchesHost(hostname: string, host: string): boolean {
  const found = hostname.toLowerCase();
  const expected = host.toLowerCase();
  return found === expected || found.endsWith(`.${expected}`);
}
