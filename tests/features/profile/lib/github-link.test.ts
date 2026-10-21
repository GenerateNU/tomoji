import { describe, expect, it } from "vitest";
import { parseGithubLink } from "@/features/profile/lib/github-link";

describe("GitHub profile links", () => {
  it("trims a pasted link and supplies HTTPS when omitted", () => {
    expect(parseGithubLink("  github.com/zahra  ")).toEqual({
      ok: true,
      value: "https://github.com/zahra",
    });
  });

  it("allows an HTTPS GitHub link", () => {
    expect(parseGithubLink("https://www.github.com/zahra")).toEqual({
      ok: true,
      value: "https://www.github.com/zahra",
    });
  });

  it("clears the saved link when the field is empty", () => {
    expect(parseGithubLink("  ")).toEqual({ ok: true, value: null });
  });

  it.each([
    "javascript:alert(1)",
    "http://github.com/zahra",
    "https://github.com.evil.example/zahra",
    "https://example.com/github.com/zahra",
    "https://github.com@evil.example/zahra",
    "https://name:password@github.com/zahra",
    "https://github.com:8443/zahra",
    "https://github.com/",
    "not a URL",
  ])("rejects an unsafe or incomplete link: %s", (link) => {
    expect(parseGithubLink(link)).toEqual({
      ok: false,
      error: "Enter a GitHub URL, such as https://github.com/username.",
    });
  });
});
