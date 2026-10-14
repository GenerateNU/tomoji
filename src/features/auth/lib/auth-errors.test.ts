import {
  AuthenticationException,
  BadRequestException,
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

// Shapes below marked "observed" were captured from the WorkOS sandbox.
const workosError = (code: string, message: string) =>
  new GenericServerException(400, message, { code, message }, "req");

test("wrong credentials don't say which part was wrong", () => {
  // Observed for both an unknown email and a wrong password.
  const error = workosError("invalid_credentials", "Invalid credentials for 'z@example.com'.");
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

test("an expired pending sign-in asks the user to log in again", () => {
  // Observed.
  const error = workosError(
    "invalid_pending_authentication_token",
    "The pending_authentication_token has expired or is invalid.",
  );
  expect(classifyAuthError(error, "verify_email")).toEqual({
    kind: "form",
    message: "Your sign-in expired. Log in again to get a new code.",
  });
});

test("an email domain that requires SSO says so", () => {
  // Observed: the sandbox's test organization claims example.com.
  const error = new AuthenticationException(
    400,
    {
      error: "sso_required",
      error_description: "User must authenticate using one of the matching connections.",
    },
    "req",
  );
  expect(classifyAuthError(error, "log_in")).toEqual({
    kind: "form",
    message:
      "This email signs in through your organization's single sign-on, which Tomoji doesn't support yet.",
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

test("an email WorkOS rejects as malformed points at the email field, in every flow", () => {
  // Observed for "AHI;WFHA;WEIHFUA@gmail.com" on log in and reset request.
  const error = new UnprocessableEntityException({
    code: "invalid_request_parameters",
    errors: [{ field: "", code: "email_required" }],
    requestID: "req",
  });
  for (const flow of ["sign_up", "log_in", "request_reset"] as const) {
    expect(classifyAuthError(error, flow)).toEqual({
      kind: "field",
      field: "email",
      message: "Enter a valid email address.",
    });
  }
});

test("a taken email reported as a 400 points at the email field", () => {
  // Observed: createUser for an email that already has an account.
  const error = new BadRequestException({
    code: "user_creation_error",
    message: "Could not create user.",
    errors: [{ code: "email_not_available", message: "This email is not available." }],
    requestID: "req",
  });
  expect(classifyAuthError(error, "sign_up")).toEqual({
    kind: "field",
    field: "email",
    message: "That email already has an account. Log in instead.",
  });
});

// Observed: createUser with "abc12345" — WorkOS checks the password before the email.
const weakPassword = (details: object[]) =>
  new BadRequestException({ code: "password_strength_error", errors: details, requestID: "req" });
const tooShort = { code: "password_too_short", minimum_length: 10 };
const tooWeak = {
  code: "password_too_weak",
  warning: "This is a commonly used password.",
  suggestions: ["Add more words that are less common."],
};

test("a short password says WorkOS's minimum length", () => {
  for (const flow of ["sign_up", "reset_password"] as const) {
    expect(classifyAuthError(weakPassword([tooShort, tooWeak]), flow)).toEqual({
      kind: "field",
      field: "password",
      message: "Use at least 10 characters.",
    });
  }
});

test("a long but guessable password passes on WorkOS's warning", () => {
  expect(classifyAuthError(weakPassword([tooWeak]), "sign_up")).toEqual({
    kind: "field",
    field: "password",
    message: "This is a commonly used password. Try adding a few uncommon words.",
  });
  expect(
    classifyAuthError(weakPassword([{ code: "password_too_weak", warning: "" }]), "sign_up"),
  ).toEqual({
    kind: "field",
    field: "password",
    message: "This password is too easy to guess. Try adding a few uncommon words.",
  });
});
