"use client";

import { logInAction } from "@/app/auth/actions";
import { useAuthForm } from "../hooks/use-auth-form";
import type { FormState } from "../lib/form";
import { withNext } from "../lib/access";
import { logInRules, type LogInField } from "../lib/rules";
// import { OrDivider } from "./auth-layout";
import { FormAlert } from "./form-alert";
import { FormField } from "./form-field";
// import { GoogleButton } from "./google-button";
import { SubmitButton } from "./submit-button";
import { TextLink } from "./text-link";

/**
 * `notice` shows a problem from before this page, e.g. a failed Google sign-in.
 * `next` is where to go after signing in.
 */
export function LogInForm({
  notice = null,
  next = "/",
}: {
  notice?: string | null;
  next?: string;
}) {
  const initialState: FormState<LogInField> = {
    values: {},
    fieldErrors: {},
    formError: notice,
  };
  const { state, field, formProps, busy } = useAuthForm(logInAction, initialState, logInRules);

  return (
    <>
      {/*<GoogleButton next={next} />*/}
      {/*<OrDivider />*/}
      <form {...formProps} className="grid gap-4">
        <input type="hidden" name="next" value={next} />
        <FormAlert message={state.formError} />
        <FormField required label="Email" type="email" autoComplete="email" {...field("email")} />
        <FormField
          required
          label="Password"
          type="password"
          autoComplete="current-password"
          labelAction={
            <TextLink href="/forgot-password" className="text-sm font-normal text-muted-foreground">
              Forgot password?
            </TextLink>
          }
          {...field("password")}
        />
        <SubmitButton busy={busy}>Log in</SubmitButton>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        Don&apos;t have an account? <TextLink href={withNext("/signup", next)}>Sign up</TextLink>
      </p>
    </>
  );
}
