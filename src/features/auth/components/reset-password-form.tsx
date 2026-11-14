"use client";

import { resetPasswordAction } from "@/app/auth/actions";
import { useAuthForm } from "../hooks/use-auth-form";
import { emptyFormState } from "../lib/form";
import { resetPasswordRules, type ResetPasswordField } from "../lib/rules";
import { FormAlert } from "./form-alert";
import { FormField } from "./form-field";
import { SubmitButton } from "./submit-button";
import { TextLink } from "./text-link";

const initialState = emptyFormState<ResetPasswordField>();

/** `token` comes from the link in the reset email. */
export function ResetPasswordForm({ token }: { token: string }) {
  const { state, errors, field, formProps, busy } = useAuthForm(
    resetPasswordAction,
    initialState,
    resetPasswordRules,
  );

  return (
    <>
      <form {...formProps} className="grid gap-4">
        {/* The token has no visible field, so its problems show at the top. */}
        <FormAlert message={state.formError ?? errors.token} />
        <input type="hidden" name="token" value={token} />
        <FormField
          required
          label="New password"
          type="password"
          autoComplete="new-password"
          {...field("password")}
        />
        <SubmitButton busy={busy}>Reset password</SubmitButton>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        Link not working? <TextLink href="/forgot-password">Request a new one</TextLink>
      </p>
    </>
  );
}
