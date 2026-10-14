import {
  AuthenticationException,
  GenericServerException,
  NotFoundException,
  OauthException,
  RateLimitExceededException,
  UnprocessableEntityException,
} from "@workos-inc/node";
import { expect, test } from "vitest";
import { classifyAuthError } from "./auth-errors";

// Built the way @workos-inc/node builds them from API responses.
const unprocessable = (codes: string[]) =>
  new UnprocessableEntityException({
    code: "user_creation_error",
    errors: codes.map((code) => ({ field: "", code })),
    requestID: "req",
  });

test("an unverified email asks for the emailed code", () => {
  const error = new AuthenticationException(
    403,
    { code: "email_verification_required", pending_authentication_token: "pending-token" },
    "req",
  );
  expect(classifyAuthError(error, "log_in")).toEqual({
    kind: "verify_email",
    pendingAuthenticationToken: "pending-token",
  });
});

test("wrong credentials don't say which part was wrong", () => {
  const error = new OauthException(400, "req", "invalid_grant", "Invalid credentials.", {});
  expect(classifyAuthError(error, "log_in")).toEqual({
    kind: "form",
    message: "Wrong email or password.",
  });
});

test("a taken email points at the email field", () => {
  expect(classifyAuthError(unprocessable(["email_not_available"]), "sign_up")).toEqual({
    kind: "field",
    field: "email",
    message: "That email already has an account. Log in instead.",
  });
});

test("a weak password points at the password field", () => {
  expect(classifyAuthError(unprocessable(["password_strength_error"]), "sign_up")).toEqual({
    kind: "field",
    field: "password",
    message: "Choose a stronger password.",
  });
  expect(
    classifyAuthError(unprocessable(["password_strength_error"]), "reset_password"),
  ).toMatchObject({
    field: "password",
  });
});

test("a used or expired reset link asks for a new one", () => {
  const error = new NotFoundException({
    path: "/user_management/password_reset/confirm",
    requestID: "req",
  });
  expect(classifyAuthError(error, "reset_password")).toEqual({
    kind: "form",
    message: "This reset link has expired or was already used. Request a new one.",
  });
});

test("a wrong verification code points at the code field", () => {
  const error = new OauthException(400, "req", "invalid_grant", "Code invalid.", {});
  expect(classifyAuthError(error, "verify_email")).toEqual({
    kind: "field",
    field: "code",
    message: "That code isn't right or has expired.",
  });
});

test("rate limits ask the user to wait, in every flow", () => {
  const error = new RateLimitExceededException("Too many", "req", 30);
  for (const flow of [
    "sign_up",
    "log_in",
    "request_reset",
    "reset_password",
    "verify_email",
  ] as const) {
    expect(classifyAuthError(error, flow)).toEqual({
      kind: "form",
      message: "Too many attempts. Wait a minute and try again.",
    });
  }
});

test("outages and unknown errors stay generic", () => {
  const outage = new GenericServerException(503, "Service Unavailable", {}, "req");
  const generic = { kind: "form", message: "Something went wrong. Try again.", unexpected: true };
  expect(classifyAuthError(outage, "log_in")).toEqual(generic);
  expect(classifyAuthError(new Error("socket hang up"), "sign_up")).toEqual(generic);
});

test("a sign-in step we don't support explains instead of failing silently", () => {
  const error = new AuthenticationException(403, { code: "mfa_challenge" }, "req");
  expect(classifyAuthError(error, "log_in")).toEqual({
    kind: "form",
    message:
      "This account needs a sign-in step Tomoji doesn't support yet. Contact the Tomoji team.",
  });
});
