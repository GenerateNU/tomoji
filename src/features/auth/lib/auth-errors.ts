import {
  AuthenticationException,
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

/**
 * WorkOS reports validation problems as codes, e.g. `email_not_available`.
 * The SDK folds a 422's per-field codes into `message`, so check both.
 */
function mentions(error: { code?: string; message: string }, fragment: string): boolean {
  return (error.code ?? "").includes(fragment) || error.message.includes(fragment);
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
    // MFA, SSO and organization selection — configured in WorkOS, not built here.
    return {
      kind: "form",
      message:
        "This account needs a sign-in step Tomoji doesn't support yet. Contact the Tomoji team.",
    };
  }

  switch (flow) {
    case "log_in":
      if (error instanceof OauthException) {
        // One message for both, so the form doesn't reveal which emails have accounts.
        return { kind: "form", message: "Wrong email or password." };
      }
      break;
    case "sign_up":
      if (error instanceof UnprocessableEntityException) {
        if (mentions(error, "email_not_available")) {
          return {
            kind: "field",
            field: "email",
            message: "That email already has an account. Log in instead.",
          };
        }
        if (mentions(error, "password")) {
          return { kind: "field", field: "password", message: "Choose a stronger password." };
        }
      }
      break;
    case "reset_password":
      if (error instanceof UnprocessableEntityException && mentions(error, "password_strength")) {
        return { kind: "field", field: "password", message: "Choose a stronger password." };
      }
      if (error instanceof NotFoundException || error instanceof UnprocessableEntityException) {
        return {
          kind: "form",
          message: "This reset link has expired or was already used. Request a new one.",
        };
      }
      break;
    case "verify_email":
      if (error instanceof OauthException || error instanceof UnprocessableEntityException) {
        return { kind: "field", field: "code", message: "That code isn't right or has expired." };
      }
      break;
  }

  return { kind: "form", message: GENERIC, unexpected: true };
}
