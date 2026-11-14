import type { ForgotPasswordState } from "@/app/auth/actions";

const calls: { name: string; email?: string }[] = [];
let resetFailure = false;
let resetRelease: (() => void) | undefined;
let resetDelay: Promise<void> | undefined;

export const authFixture = {
  calls,
  failNextReset() {
    resetFailure = true;
  },
  delayReset() {
    resetDelay = new Promise<void>((resolve) => {
      resetRelease = resolve;
    });
  },
  releaseReset() {
    resetRelease?.();
    resetDelay = undefined;
    resetRelease = undefined;
  },
};

// Only the browser fixture imports these replacements. No WorkOS request or
// session mutation is made while exercising the real settings components.
export async function requestPasswordResetAction(
  _previous: ForgotPasswordState,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const email = String(formData.get("email"));
  calls.push({ name: "requestPasswordReset", email });
  if (resetDelay) await resetDelay;
  if (resetFailure) {
    resetFailure = false;
    return {
      values: { email },
      fieldErrors: {},
      formError: "We couldn't send your reset link. Try again.",
      sentTo: null,
    };
  }
  return { values: { email }, fieldErrors: {}, formError: null, sentTo: email };
}

export async function signOutAction() {
  calls.push({ name: "signOut" });
}
