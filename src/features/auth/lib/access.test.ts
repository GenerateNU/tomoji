import { expect, test } from "vitest";
import { redirectFor } from "./access";

test("signed-out visitors to app pages are sent to log in", () => {
  expect(redirectFor("/opportunities", false)).toBe("/login");
  expect(redirectFor("/campaigns/abc", false)).toBe("/login");
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
    expect(redirectFor(path, false)).toBeNull();
  }
});

test("signed-in users skip the log-in and sign-up pages", () => {
  expect(redirectFor("/login", true)).toBe("/");
  expect(redirectFor("/signup", true)).toBe("/");
});

test("signed-in users can still finish a password reset and use app pages", () => {
  expect(redirectFor("/reset-password", true)).toBeNull();
  expect(redirectFor("/opportunities", true)).toBeNull();
});

test("lookalike paths are not treated as public", () => {
  expect(redirectFor("/login-history", false)).toBe("/login");
  expect(redirectFor("/authors", false)).toBe("/login");
});
