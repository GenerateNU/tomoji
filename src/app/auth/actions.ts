"use server";

import { getWorkOS, saveSession, signOut } from "@workos-inc/authkit-nextjs";
import { NotFoundException, type AuthenticationResponse } from "@workos-inc/node";
import { redirect } from "next/navigation";
import {
  classifyAuthError,
  type AuthFailure,
  type AuthFlow,
} from "@/features/auth/lib/auth-errors";
import { echoable, parseForm, type FormState } from "@/features/auth/lib/form";
import {
  clearPendingAuth,
  readPendingAuth,
  savePendingAuth,
} from "@/features/auth/lib/pending-auth";
import {
  forgotPasswordRules,
  logInRules,
  resetPasswordRules,
  signUpRules,
  verifyEmailRules,
  type ForgotPasswordField,
  type LogInField,
  type ResetPasswordField,
  type SignUpField,
  type VerifyEmailField,
} from "@/features/auth/lib/rules";

// Where everyone lands after signing in. Pages pick the creator or company
// view from the user's role.
const HOME = "/";

const userManagement = () => getWorkOS().userManagement;
const clientId = () => process.env.WORKOS_CLIENT_ID!;
// saveSession only uses this URL to decide cookie settings (domain, secure).
const sessionUrl = () => process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI!;

export async function signOutAction() {
  const returnTo = new URL(process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI!).origin;
  await signOut({ returnTo });
}

export async function signUpAction(
  _previous: FormState<SignUpField>,
  formData: FormData,
): Promise<FormState<SignUpField>> {
  const parsed = parseForm(formData, signUpRules);
  if (!parsed.ok) return parsed.state;
  const { firstName, lastName, email, password } = parsed.data;

  // Every self-serve account starts as a creator; the user.created webhook
  // syncs it into Convex. A retry after a half-finished attempt hits
  // email_not_available, which tells the user to log in instead.
  return signIn("sign_up", parsed.data, email, async () => {
    await userManagement().createUser({ email, password, firstName, lastName });
    return userManagement().authenticateWithPassword({ clientId: clientId(), email, password });
  });
}

export async function logInAction(
  _previous: FormState<LogInField>,
  formData: FormData,
): Promise<FormState<LogInField>> {
  const parsed = parseForm(formData, logInRules);
  if (!parsed.ok) return parsed.state;
  const { email, password } = parsed.data;

  return signIn("log_in", parsed.data, email, () =>
    userManagement().authenticateWithPassword({ clientId: clientId(), email, password }),
  );
}

export async function verifyEmailAction(
  _previous: FormState<VerifyEmailField>,
  formData: FormData,
): Promise<FormState<VerifyEmailField>> {
  const parsed = parseForm(formData, verifyEmailRules);
  if (!parsed.ok) return parsed.state;

  const pending = await readPendingAuth();
  if (pending === null) {
    return {
      values: {},
      fieldErrors: {},
      formError: "Your sign-in expired. Log in again to get a new code.",
    };
  }

  return signIn("verify_email", parsed.data, pending.email, async () => {
    const response = await userManagement().authenticateWithEmailVerification({
      clientId: clientId(),
      code: parsed.data.code,
      pendingAuthenticationToken: pending.token,
    });
    await clearPendingAuth();
    return response;
  });
}

export type ForgotPasswordState = FormState<ForgotPasswordField> & { sentTo: string | null };

export async function requestPasswordResetAction(
  _previous: ForgotPasswordState,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const parsed = parseForm(formData, forgotPasswordRules);
  if (!parsed.ok) return { ...parsed.state, sentTo: null };
  const { email } = parsed.data;

  try {
    // WorkOS emails the link, pointing at the password reset URL set in its dashboard.
    await userManagement().createPasswordReset({ email });
  } catch (error) {
    // Unknown emails get the same confirmation, so this form can't be used to
    // find out who has an account.
    if (!(error instanceof NotFoundException)) {
      return { ...failureState("request_reset", error, parsed.data), sentTo: null };
    }
  }
  return { values: { email }, fieldErrors: {}, formError: null, sentTo: email };
}

export async function resetPasswordAction(
  _previous: FormState<ResetPasswordField>,
  formData: FormData,
): Promise<FormState<ResetPasswordField>> {
  const parsed = parseForm(formData, resetPasswordRules);
  if (!parsed.ok) return parsed.state;
  const { token, password } = parsed.data;

  let email: string;
  try {
    ({
      user: { email },
    } = await userManagement().resetPassword({ token, newPassword: password }));
  } catch (error) {
    return failureState("reset_password", error, parsed.data);
  }

  return signIn("log_in", parsed.data, email, () =>
    userManagement().authenticateWithPassword({ clientId: clientId(), email, password }),
  );
}

/**
 * Runs a WorkOS authentication and saves the session. Failures come back as
 * form state, except a required email code, which moves the user to
 * /verify-email.
 *
 * Success returns `redirectTo` rather than redirecting here: the client's
 * AuthKitProvider (and Convex with it) only learns about the new session when
 * the form asks it to, before navigating.
 */
async function signIn<Field extends string>(
  flow: AuthFlow,
  data: Record<Field, string>,
  email: string,
  authenticate: () => Promise<AuthenticationResponse>,
): Promise<FormState<Field>> {
  let response: AuthenticationResponse;
  try {
    response = await authenticate();
  } catch (error) {
    const failure = classifyAuthError(error, flow);
    if (failure.kind !== "verify_email") return toState(failure, error, flow, data);
    await savePendingAuth({ token: failure.pendingAuthenticationToken, email });
    redirect("/verify-email");
  }
  await saveSession(response, sessionUrl());
  return { values: {}, fieldErrors: {}, formError: null, redirectTo: HOME };
}

function failureState<Field extends string>(
  flow: AuthFlow,
  error: unknown,
  data: Record<Field, string>,
): FormState<Field> {
  const failure = classifyAuthError(error, flow);
  // Only sign-ins can pause for an emailed code; these flows don't sign in yet.
  if (failure.kind === "verify_email") {
    return toState(
      { kind: "form", message: "Log in to finish verifying your email." },
      error,
      flow,
      data,
    );
  }
  return toState(failure, error, flow, data);
}

function toState<Field extends string>(
  failure: Exclude<AuthFailure, { kind: "verify_email" }>,
  error: unknown,
  flow: AuthFlow,
  data: Record<Field, string>,
): FormState<Field> {
  if (failure.kind === "form" && failure.unexpected) logUnexpected(flow, error);
  const values = echoable(data);
  if (failure.kind === "form") return { values, fieldErrors: {}, formError: failure.message };
  const fieldErrors: FormState<Field>["fieldErrors"] = {};
  fieldErrors[failure.field as Field] = failure.message;
  return { values, fieldErrors, formError: null };
}

/** Logs enough to find the request in WorkOS, and nothing the user typed. */
function logUnexpected(flow: AuthFlow, error: unknown) {
  const details =
    error instanceof Error
      ? {
          name: error.name,
          status: "status" in error ? error.status : undefined,
          requestID: "requestID" in error ? error.requestID : undefined,
        }
      : { name: typeof error };
  console.error(`[auth] ${flow} failed`, details);
}
