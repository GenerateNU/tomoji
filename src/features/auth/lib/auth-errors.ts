import {
  AuthenticationException,
  BadRequestException,
  GenericServerException,
  NotFoundException,
  OauthException,
  RateLimitExceededException,
  UnprocessableEntityException,
} from "@workos-inc/node";

export type AuthFlow = "sign_up" | "log_in" | "request_reset" | "reset_password" | "verify_email";

/** How a failed WorkOS call should show up in the form. */
export type AuthFailure =
  | { kind: "verify_email"; pendingAuthenticationToken: string }
  | { kind: "field"; field: "email" | "password" | "code"; message: string }
  | { kind: "form"; message: string; unexpected?: true };

const GENERIC = "Something went wrong. Try again.";

export const EMAIL_TAKEN: Extract<AuthFailure, { kind: "field" }> = {
  kind: "field",
  field: "email",
  message: "That email already has an account. Log in instead.",
};

/**
 * Whether a WorkOS validation error carries a code like `email_not_available`.
 * A 400 lists them in `errors`; for a 422 the SDK folds them into `message`.
 */
function mentions(error: unknown, fragment: string): boolean {
  if (error instanceof BadRequestException) {
    const details = (error.errors ?? []).map((detail) => (detail as { code?: unknown }).code);
    return [error.code, ...details].some(
      (code) => typeof code === "string" && code.includes(fragment),
    );
  }
  if (error instanceof UnprocessableEntityException) {
    return (error.code ?? "").includes(fragment) || error.message.includes(fragment);
  }
  return false;
}

/**
 * WorkOS's password policy, explained from its own error details, e.g.
 * `{ code: "password_too_short", minimum_length: 10 }`. Null when the error
 * isn't about the password. Length comes first: it's the quickest fix.
 */
function passwordProblem(error: unknown): string | null {
  if (!mentions(error, "password")) return null;
  const details = error instanceof BadRequestException ? (error.errors ?? []) : [];
  const find = (code: string) =>
    details.find(
      (detail): detail is Record<string, unknown> =>
        typeof detail === "object" && detail !== null && "code" in detail && detail.code === code,
    );

  const tooShort = find("password_too_short");
  if (tooShort && typeof tooShort.minimum_length === "number") {
    return `Use at least ${tooShort.minimum_length} characters.`;
  }
  const tooWeak = find("password_too_weak");
  if (tooWeak) {
    const warning = typeof tooWeak.warning === "string" ? tooWeak.warning.trim() : "";
    return `${warning || "This password is too easy to guess."} Try adding a few uncommon words.`;
  }
  return "Choose a stronger password.";
}

/** WorkOS errors without a dedicated exception class still carry a `code`. */
function hasCode(error: unknown, code: string): boolean {
  return error instanceof GenericServerException && error.code === code;
}

/**
 * Maps a WorkOS error to user-facing copy. Anything unrecognised becomes a
 * generic message marked `unexpected`, which the caller should log.
 */
export function classifyAuthError(error: unknown, flow: AuthFlow): AuthFailure {
  if (error instanceof RateLimitExceededException) {
    return { kind: "form", message: "Too many attempts. Wait a minute and try again." };
  }

  if (error instanceof AuthenticationException) {
    if (error.code === "email_verification_required" && error.pendingAuthenticationToken) {
      return { kind: "verify_email", pendingAuthenticationToken: error.pendingAuthenticationToken };
    }
    if (error.code === "sso_required") {
      return {
        kind: "form",
        message:
          "This email signs in through your organization's single sign-on, which Tomoji doesn't support yet.",
      };
    }
    // MFA and organization selection — configured in WorkOS, not built here.
    return {
      kind: "form",
      message:
        "This account needs a sign-in step Tomoji doesn't support yet. Contact the Tomoji team.",
    };
  }

  // WorkOS's code for an email it can't parse, whichever flow sent it.
  if (mentions(error, "email_required")) {
    return { kind: "field", field: "email", message: "Enter a valid email address." };
  }

  const password = passwordProblem(error);

  switch (flow) {
    case "log_in":
      // WorkOS sends invalid_credentials for an unknown email and a wrong password alike.
      if (hasCode(error, "invalid_credentials") || error instanceof OauthException) {
        // One message for both, so the form doesn't reveal which emails have accounts.
        return { kind: "form", message: "Wrong email or password." };
      }
      break;
    case "sign_up":
      // Observed as a 400 with `email_not_available` in its errors.
      if (mentions(error, "email_not_available")) return EMAIL_TAKEN;
      // WorkOS checks the password first, so this can hide a taken email.
      if (password) return { kind: "field", field: "password", message: password };
      break;
    case "reset_password":
      if (password) return { kind: "field", field: "password", message: password };
      if (error instanceof NotFoundException || error instanceof UnprocessableEntityException) {
        return {
          kind: "form",
          message: "This reset link has expired or was already used. Request a new one.",
        };
      }
      break;
    case "verify_email":
      if (hasCode(error, "invalid_pending_authentication_token")) {
        return { kind: "form", message: "Your sign-in expired. Log in again to get a new code." };
      }
      if (error instanceof OauthException || error instanceof UnprocessableEntityException) {
        return { kind: "field", field: "code", message: "That code isn't right or has expired." };
      }
      break;
  }

  return { kind: "form", message: GENERIC, unexpected: true };
}
