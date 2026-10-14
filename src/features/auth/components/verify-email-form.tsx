"use client";

import { verifyEmailAction } from "@/app/auth/actions";
import { useAuthForm } from "../hooks/use-auth-form";
import { emptyFormState } from "../lib/form";
import { verifyEmailRules, type VerifyEmailField } from "../lib/rules";
import { FormAlert } from "./form-alert";
import { FormField } from "./form-field";
import { SubmitButton } from "./submit-button";
import { TextLink } from "./text-link";

const initialState = emptyFormState<VerifyEmailField>();

export function VerifyEmailForm({ email }: { email: string }) {
  const { state, field, formProps, busy } = useAuthForm(
    verifyEmailAction,
    initialState,
    verifyEmailRules,
  );

  return (
    <>
      <p className="text-sm text-muted-foreground">
        We sent a code to <span className="font-medium text-foreground">{email}</span>. Enter it to
        finish signing in.
      </p>
      <form {...formProps} className="grid gap-4">
        <FormAlert message={state.formError} />
        <FormField
          required
          label="Code"
          inputMode="numeric"
          autoComplete="one-time-code"
          {...field("code")}
        />
        <SubmitButton busy={busy}>Verify email</SubmitButton>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        Didn&apos;t get it? <TextLink href="/login">Log in again</TextLink> to get a new code.
      </p>
    </>
  );
}
