"use client";

import { signUpAction } from "@/app/auth/actions";
import { useAuthForm } from "../hooks/use-auth-form";
import { emptyFormState } from "../lib/form";
import { signUpRules, type SignUpField } from "../lib/rules";
import { OrDivider } from "./auth-layout";
import { FormAlert } from "./form-alert";
import { FormField } from "./form-field";
import { GoogleButton } from "./google-button";
import { SubmitButton } from "./submit-button";
import { TextLink } from "./text-link";

const initialState = emptyFormState<SignUpField>();

export function SignUpForm() {
  const { state, field, formProps, busy } = useAuthForm(signUpAction, initialState, signUpRules);

  return (
    <>
      <GoogleButton />
      <OrDivider />
      <form {...formProps} className="grid gap-4">
        <FormAlert message={state.formError} />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            required
            label="First name"
            autoComplete="given-name"
            {...field("firstName")}
          />
          <FormField required label="Last name" autoComplete="family-name" {...field("lastName")} />
        </div>
        <FormField required label="Email" type="email" autoComplete="email" {...field("email")} />
        <FormField
          required
          label="Password"
          type="password"
          autoComplete="new-password"
          {...field("password")}
        />
        <SubmitButton busy={busy}>Get started</SubmitButton>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        Already have an account? <TextLink href="/login">Log in</TextLink>
      </p>
    </>
  );
}
