"use client";

import { useState } from "react";
import { requestPasswordResetAction, type ForgotPasswordState } from "@/app/auth/actions";
import { useAuthForm } from "../hooks/use-auth-form";
import { forgotPasswordRules } from "../lib/rules";
import { FormAlert } from "./form-alert";
import { FormField } from "./form-field";
import { SubmitButton } from "./submit-button";
import { TextLink } from "./text-link";

const initialState: ForgotPasswordState = {
  values: {},
  fieldErrors: {},
  formError: null,
  sentTo: null,
};

/** Asks for an email, then confirms the link was sent and offers to send it again. */
export function ForgotPasswordForm() {
  const { state, field, formProps, busy } = useAuthForm(
    requestPasswordResetAction,
    initialState,
    forgotPasswordRules,
  );

  // Counts confirmed sends, so a re-send visibly does something.
  const [sends, setSends] = useState(0);
  const [countedState, setCountedState] = useState(state);
  if (countedState !== state) {
    setCountedState(state);
    if (state.sentTo) setSends((count) => count + 1);
  }

  if (state.sentTo) {
    return (
      <>
        <p role="status" className="text-sm text-muted-foreground">
          {sends > 1 ? "We sent another link to " : "Check your email at "}
          <span className="font-medium text-foreground">{state.sentTo}</span> for a link to reset
          your password.
        </p>
        <form {...formProps} className="grid gap-4">
          <FormAlert message={state.formError} />
          <input type="hidden" name="email" value={state.sentTo} />
          <SubmitButton busy={busy}>Re-send link</SubmitButton>
        </form>
        <BackToLogIn />
      </>
    );
  }

  return (
    <>
      <p className="text-sm text-muted-foreground">
        Type in the email for your account. We&apos;ll send it a link to reset your password.
      </p>
      <form {...formProps} className="grid gap-4">
        <FormAlert message={state.formError} />
        <FormField required label="Email" type="email" autoComplete="email" {...field("email")} />
        <SubmitButton busy={busy}>Send link</SubmitButton>
      </form>
      <BackToLogIn />
    </>
  );
}

function BackToLogIn() {
  return (
    <p className="text-center text-sm text-muted-foreground">
      Remembered it? <TextLink href="/login">Log in</TextLink>
    </p>
  );
}
