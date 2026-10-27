import { describe, expect, test } from "vitest";
import { requireUrl } from "../../lib/urls";

const rules = { reason: "invalid_link" } as const;

function reasonOf(call: () => unknown): unknown {
  try {
    call();
  } catch (error) {
    return (error as { data?: { reason?: unknown } }).data?.reason;
  }
  throw new Error("expected the call to throw");
}

describe("requireUrl", () => {
  test("returns the parsed URL so callers store what was checked", () => {
    expect(requireUrl("  https://example.com/work  ", rules)).toBe("https://example.com/work");
    expect(requireUrl("https://example.com", rules)).toBe("https://example.com/");
  });

  test("refuses anything that is not a URL", () => {
    expect(reasonOf(() => requireUrl("example.com", rules))).toBe("invalid_link");
    expect(reasonOf(() => requireUrl("", rules))).toBe("invalid_link");
  });

  test("refuses schemes that are not https", () => {
    expect(reasonOf(() => requireUrl("http://example.com", rules))).toBe("invalid_link");
    expect(reasonOf(() => requireUrl("javascript:alert(1)", rules))).toBe("invalid_link");
    expect(reasonOf(() => requireUrl("data:text/html,hi", rules))).toBe("invalid_link");
  });

  test("allows plain http only when the caller opts in", () => {
    expect(requireUrl("http://example.com/x", { ...rules, allowHttp: true })).toBe(
      "http://example.com/x",
    );
    expect(reasonOf(() => requireUrl("javascript:alert(1)", { ...rules, allowHttp: true }))).toBe(
      "invalid_link",
    );
  });

  test("refuses credentials, which disguise the real host", () => {
    expect(reasonOf(() => requireUrl("https://example.com@evil.test", rules))).toBe("invalid_link");
    expect(reasonOf(() => requireUrl("https://user:pw@example.com", rules))).toBe("invalid_link");
  });

  describe("with a host allowlist", () => {
    const hosted = { reason: "invalid_github_link", hosts: ["github.com"] } as const;

    test("accepts the host itself and its subdomains", () => {
      expect(requireUrl("https://github.com/zahra", hosted)).toBe("https://github.com/zahra");
      expect(requireUrl("https://www.github.com/zahra", hosted)).toBe(
        "https://www.github.com/zahra",
      );
    });

    test("refuses a lookalike host that merely ends with the name", () => {
      expect(reasonOf(() => requireUrl("https://github.com.evil.test/zahra", hosted))).toBe(
        "invalid_github_link",
      );
      expect(reasonOf(() => requireUrl("https://notgithub.com/zahra", hosted))).toBe(
        "invalid_github_link",
      );
    });
  });

  describe("with a length cap", () => {
    const capped = {
      reason: "draftUrl_invalid",
      maxLength: 40,
      tooLongReason: "draftUrl_too_long",
    };

    test("measures the encoded URL, which can be longer than what was typed", () => {
      expect(reasonOf(() => requireUrl(`https://example.com/${"a".repeat(40)}`, capped))).toBe(
        "draftUrl_too_long",
      );
    });

    test("accepts a URL within the cap", () => {
      expect(requireUrl("https://example.com/ok", capped)).toBe("https://example.com/ok");
    });
  });
});
