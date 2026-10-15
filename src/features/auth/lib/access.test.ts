import { describe, expect, test } from "vitest";
import { redirectFor, safeNext, withNext } from "./access";

function request(method: string, path: string) {
  const url = new URL(path, "http://x");
  return { method, pathname: url.pathname, search: url.search };
}
const get = (path: string) => request("GET", path);
const head = (path: string) => request("HEAD", path);
const post = (path: string) => request("POST", path);

test("signed-out visitors to app pages are sent to log in, remembering where they were headed", () => {
  expect(redirectFor(get("/opportunities"), false)).toBe("/login?next=%2Fopportunities");
  expect(redirectFor(get("/campaigns/abc?tab=applied"), false)).toBe(
    "/login?next=%2Fcampaigns%2Fabc%3Ftab%3Dapplied",
  );
});

test("HEAD requests are redirected like GET", () => {
  expect(redirectFor(head("/opportunities"), false)).toBe("/login?next=%2Fopportunities");
});

test("signed-out visitors can reach the landing page and every auth page", () => {
  for (const path of [
    "/",
    "/login",
    "/signup",
    "/forgot-password",
    "/reset-password",
    "/verify-email",
    "/auth/callback",
    "/auth/google",
    "/api/x/callback",
  ]) {
    expect(redirectFor(get(path), false)).toBeNull();
  }
});

test("non-GET requests pass through for signed-in users, so AuthKit's getAuth() action keeps its session", () => {
  expect(redirectFor(post("/login"), true)).toBeNull();
  expect(redirectFor(post("/signup"), true)).toBeNull();
});

test("signed-out non-GET requests pass through too; actions check auth themselves", () => {
  expect(redirectFor(post("/opportunities"), false)).toBeNull();
});

test("signed-in users skip the log-in and sign-up pages, going to where they were headed", () => {
  expect(redirectFor(get("/login?next=%2Fcampaigns%2Fabc"), true)).toBe("/campaigns/abc");
  expect(redirectFor(get("/signup?next=%2Fcampaigns%2Fabc"), true)).toBe("/campaigns/abc");
  expect(redirectFor(get("/login"), true)).toBe("/");
});

test("signed-in users are never sent off-site or back to an auth page", () => {
  expect(redirectFor(get("/login?next=https://evil.com"), true)).toBe("/");
  expect(redirectFor(get("/login?next=//evil.com"), true)).toBe("/");
  expect(redirectFor(get("/login?next=%2Flogin"), true)).toBe("/");
});

test("signed-in users can still finish a password reset and use app pages", () => {
  expect(redirectFor(get("/reset-password"), true)).toBeNull();
  expect(redirectFor(get("/opportunities"), true)).toBeNull();
});

test("lookalike paths are not treated as public", () => {
  expect(redirectFor(get("/login-history"), false)).toBe("/login?next=%2Flogin-history");
  expect(redirectFor(get("/authors"), false)).toBe("/login?next=%2Fauthors");
});

describe("safeNext", () => {
  test.each(["/opportunities", "/campaigns/abc?tab=applied", "/login-history", "/authors"])(
    "keeps the in-app path %s",
    (path) => {
      expect(safeNext(path)).toBe(path);
    },
  );

  test.each<[string, unknown]>([
    ["undefined", undefined],
    ["null", null],
    ["a number", 42],
    ["an array", ["/a"]],
    ["an empty string", ""],
    ["a relative path", "opportunities"],
    ["a protocol-relative URL", "//evil.com"],
    ["a backslash after the slash", "/\\evil.com"],
    ["leading backslashes", "\\\\evil.com"],
    ["a tab", "/\tevil"],
    ["a newline", "/a\nb"],
    ["an absolute URL", "https://evil.com"],
    ["a javascript: URL", "javascript:alert(1)"],
    ["an overlong path", `/${"a".repeat(3000)}`],
  ])("falls back to home for %s", (_name, value) => {
    expect(safeNext(value)).toBe("/");
  });

  test.each([
    "/login",
    "/login?next=/x",
    "/signup",
    "/verify-email",
    "/reset-password?token=t",
    "/forgot-password",
    "/auth",
    "/auth/google",
    "/auth/callback?code=x",
    "/x/../login",
  ])("falls back to home for the auth page %s", (path) => {
    expect(safeNext(path)).toBe("/");
  });
});

describe("withNext", () => {
  test("leaves the path alone when returning home", () => {
    expect(withNext("/login", "/")).toBe("/login");
  });

  test("appends an encoded next", () => {
    expect(withNext("/login", "/a?b=c")).toBe("/login?next=%2Fa%3Fb%3Dc");
  });
});
