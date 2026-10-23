"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useMutation } from "convex/react";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { api } from "@convex/_generated/api";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorCode, errorMessage } from "@/lib/errors";

/** The fields this form may change; everything else comes from WorkOS. */
type EditableDetails = Pick<FunctionReturnType<typeof api.creators.me>, "username" | "phoneNumber">;

export function BasicDetailsForm({
  username: savedUsername,
  phoneNumber: savedPhoneNumber,
  onDiscard,
  onSaved,
}: EditableDetails & { onDiscard: () => void; onSaved: () => void }) {
  const id = useId();
  // Keep the edit-start values stable when the live profile changes elsewhere.
  const [initial] = useState({
    username: savedUsername ?? "",
    phoneNumber: savedPhoneNumber ?? "",
  });
  const [username, setUsername] = useState(initial.username);
  const [phoneNumber, setPhoneNumber] = useState(initial.phoneNumber);
  const [pending, setPending] = useState(false);
  const [usernameError, setUsernameError] = useState("");
  const [saveError, setSaveError] = useState("");
  const usernameInput = useRef<HTMLInputElement>(null);
  const submitting = useRef(false);
  const update = useMutation(api.creators.update);
  const changed = username !== initial.username || phoneNumber !== initial.phoneNumber;

  useEffect(() => {
    if (usernameError && !pending) usernameInput.current?.focus();
  }, [usernameError, pending]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || !changed) return;

    const updates: FunctionArgs<typeof api.creators.update> = {};
    if (username !== initial.username) {
      const normalized = username.trim().toLowerCase();
      if (!normalized && initial.username) {
        setUsernameError("Enter a username. An existing username cannot be cleared.");
        usernameInput.current?.focus();
        return;
      }
      if (normalized && normalized !== initial.username) updates.username = normalized;
    }
    if (phoneNumber !== initial.phoneNumber) {
      const normalized = phoneNumber.trim() || null;
      if (normalized !== (initial.phoneNumber || null)) updates.phoneNumber = normalized;
    }
    // Formatting-only edits may normalize back to the original values.
    if (Object.keys(updates).length === 0) {
      onDiscard();
      return;
    }

    submitting.current = true;
    setPending(true);
    setUsernameError("");
    setSaveError("");
    try {
      await update(updates);
      onSaved();
    } catch (error) {
      if (updates.username !== undefined && errorCode(error) === "conflict") {
        setUsernameError("That username is taken. Choose another.");
      } else {
        setSaveError(errorMessage(error));
      }
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return (
    <form onSubmit={save} noValidate aria-busy={pending} className="space-y-4">
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="min-w-0 space-y-2">
          <Label htmlFor={`${id}-username`}>Username</Label>
          <Input
            ref={usernameInput}
            id={`${id}-username`}
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
            className="h-11"
            value={username}
            disabled={pending}
            aria-invalid={!!usernameError}
            aria-describedby={`${id}-username-hint${usernameError ? ` ${id}-username-error` : ""}`}
            onChange={(event) => {
              setUsername(event.target.value);
              setUsernameError("");
              setSaveError("");
            }}
          />
          <p id={`${id}-username-hint`} className="text-sm text-muted-foreground">
            Usernames are unique and saved in lowercase. Once chosen, yours can be changed but not
            cleared.
          </p>
          {usernameError && (
            <p id={`${id}-username-error`} role="alert" className="text-sm text-destructive">
              {usernameError}
            </p>
          )}
        </div>
        <div className="min-w-0 space-y-2">
          <Label htmlFor={`${id}-phone`}>Phone number (optional)</Label>
          <Input
            id={`${id}-phone`}
            name="phoneNumber"
            type="tel"
            autoComplete="tel"
            className="h-11"
            value={phoneNumber}
            disabled={pending}
            aria-describedby={`${id}-phone-hint`}
            onChange={(event) => {
              setPhoneNumber(event.target.value);
              setSaveError("");
            }}
          />
          <p id={`${id}-phone-hint`} className="text-sm text-muted-foreground">
            Leave this blank to remove your saved phone number.
          </p>
        </div>
      </div>
      {saveError && (
        <p role="alert" className="text-sm text-destructive">
          {saveError}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-3">
        <Button
          type="button"
          aria-label="Discard basic details changes"
          variant="outline"
          className="min-h-11"
          disabled={pending}
          onClick={onDiscard}
        >
          Discard changes
        </Button>
        <Button type="submit" className="min-h-11" disabled={pending || !changed}>
          {pending && <LoaderCircle aria-hidden className="size-4 animate-spin" />}
          {pending ? "Saving basic details…" : "Save basic details"}
        </Button>
      </div>
    </form>
  );
}
