"use client";

import { useRef, useState, type SubmitEvent } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { useAction } from "convex/react";
import type { FunctionArgs } from "convex/server";
import { api } from "@convex/_generated/api";
import { Button } from "@/components/ui/button";
import { FormField } from "@/features/auth/components/form-field";
import { FormAlert } from "@/features/auth/components/form-alert";
import { email, required, validateField } from "@/features/auth/lib/form";
import { invitationError } from "@/features/team/lib/invitation-errors";

/** Lets company admins invite one teammate without changing existing members. */
export function InviteTeammate() {
  const invite = useAction(api.invites.inviteTeammate);
  const [open, setOpen] = useState(false);
  const [address, setAddress] = useState("");
  const [role, setRole] =
    useState<FunctionArgs<typeof api.invites.inviteTeammate>["role"]>("member");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const inFlight = useRef(false);
  const emailInput = useRef<HTMLInputElement>(null);

  /** Prevents duplicate sends and keeps failed input available for correction. */
  async function send(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const problem = validateField("email", address, [required("Email required"), email()]);
    setFieldError(problem);
    if (problem) {
      emailInput.current?.focus();
      return;
    }
    inFlight.current = true;
    setPending(true);
    setError(null);
    setNotice("");
    try {
      await invite({ email: address.trim(), role });
      setNotice(
        `Invitation sent to ${address.trim()}. The pending list will update after WorkOS syncs.`,
      );
      setAddress("");
      setRole("member");
      setOpen(false);
    } catch (error) {
      setError(invitationError(error, "send"));
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return (
    <div className="space-y-2 sm:max-w-sm">
      <Dialog.Root
        open={open}
        onOpenChange={(next) => {
          if (!inFlight.current) setOpen(next);
        }}
      >
        <Dialog.Trigger render={<Button className="min-h-11 rounded-full px-5" />}>
          Invite New Members
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40" />
          <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border bg-background p-6 shadow-lg sm:p-8">
            <Dialog.Title className="text-2xl font-semibold">Invite a teammate</Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-muted-foreground">
              Add one teammate to manage your campaigns.
            </Dialog.Description>
            <form onSubmit={send} noValidate className="mt-6 space-y-5">
              <fieldset disabled={pending} className="space-y-5">
                <legend className="mb-3 font-medium">Select role</legend>
                <div className="grid grid-cols-2 gap-3">
                  {(["admin", "member"] as const).map((value) => (
                    <label
                      key={value}
                      className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border px-4 has-checked:bg-primary has-checked:text-primary-foreground has-focus-visible:ring-2 has-focus-visible:ring-ring"
                    >
                      <input
                        type="radio"
                        name="role"
                        value={value}
                        checked={role === value}
                        onChange={() => setRole(value)}
                        className="accent-current"
                      />
                      {value === "admin" ? "Admin" : "Member"}
                    </label>
                  ))}
                </div>
                <FormField
                  ref={emailInput}
                  label="Email"
                  type="email"
                  required
                  autoComplete="email"
                  value={address}
                  onChange={(event) => {
                    setAddress(event.target.value);
                    setFieldError(null);
                    setError(null);
                  }}
                  error={fieldError ?? undefined}
                  hint="Invite one teammate at a time."
                  className="min-h-11"
                />
                <Button type="submit" className="min-h-11 w-full">
                  {pending ? "Sending…" : "Send invitation"}
                </Button>
              </fieldset>
              <FormAlert message={error} />
              <Dialog.Close
                disabled={pending}
                render={<Button variant="outline" className="min-h-11" />}
              >
                Cancel
              </Dialog.Close>
            </form>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
      <p role="status" className="break-words text-sm text-muted-foreground">
        {notice}
      </p>
    </div>
  );
}
