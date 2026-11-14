"use client";

import { useActionState, useId } from "react";
import { useFormStatus } from "react-dom";
import { RiLogoutBoxRLine } from "@remixicon/react";
import {
  requestPasswordResetAction,
  signOutAction,
  type ForgotPasswordState,
} from "@/app/auth/actions";
import { Button } from "@/components/ui/button";

const initialResetState: ForgotPasswordState = {
  values: {},
  fieldErrors: {},
  formError: null,
  sentTo: null,
};

export function GeneralSettingsSection({ email }: { email: string }) {
  const headingId = useId();
  const resetStatusId = useId();
  const [state, requestReset, pending] = useActionState(
    requestPasswordResetAction,
    initialResetState,
  );
  const error = state.formError ?? state.fieldErrors.email;
  const linkSent = state.sentTo !== null;

  return (
    <section
      aria-labelledby={headingId}
      className="w-full max-w-3xl space-y-6 rounded-lg bg-card p-5 shadow-card"
    >
      <h2 id={headingId} className="text-body font-medium">
        General
      </h2>
      <dl className="grid gap-6 sm:grid-cols-2">
        <div className="min-w-0 space-y-2">
          <dt className="text-body-sm text-muted-foreground">Email</dt>
          <dd className="text-body-sm break-words">{email}</dd>
        </div>
        <div className="min-w-0 space-y-2">
          <dt className="text-body-sm text-muted-foreground">Password</dt>
          <dd>
            <form action={requestReset} className="space-y-2">
              <input type="hidden" name="email" value={email} />
              <Button
                type="submit"
                variant="secondary-subtle"
                size="sm"
                disabled={pending || linkSent}
                aria-busy={pending}
                aria-describedby={resetStatusId}
              >
                {pending ? "Sending link…" : linkSent ? "Reset link sent" : "Reset password"}
              </Button>
              <div id={resetStatusId}>
                {linkSent ? (
                  <p role="status" className="text-body-sm break-words text-muted-foreground">
                    Check {state.sentTo} for a link to set a new password.
                  </p>
                ) : null}
                {error ? (
                  <p role="alert" className="text-body-sm text-red-700">
                    {error}
                  </p>
                ) : null}
              </div>
            </form>
          </dd>
        </div>
      </dl>
      <form action={signOutAction}>
        <LogoutButton />
      </form>
    </section>
  );
}

function LogoutButton() {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      variant="destructive-subtle"
      size="sm"
      icon={RiLogoutBoxRLine}
      disabled={pending}
      aria-busy={pending}
    >
      {pending ? "Logging out…" : "Log out of account"}
    </Button>
  );
}
