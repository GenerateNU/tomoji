"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/lib/errors";
import { parseBirthdate, toDateInputValue } from "../lib/birthdate";

export function PersonalDetailsForm({
  dateOfBirth,
  countryOfResidence,
  onDiscard,
  onSaved,
}: {
  dateOfBirth?: number;
  countryOfResidence?: string;
  onDiscard: () => void;
  onSaved: () => void;
}) {
  const id = useId();
  const birthdateRef = useRef<HTMLInputElement>(null);
  const submitting = useRef(false);
  const initialBirthdate = toDateInputValue(dateOfBirth);
  const initialCountry = countryOfResidence ?? "";
  const [birthdate, setBirthdate] = useState(initialBirthdate);
  const [country, setCountry] = useState(initialCountry);
  const [pending, setPending] = useState(false);
  const [today] = useState(() => toDateInputValue(Date.now()));
  const [fieldError, setFieldError] = useState("");
  const [saveError, setSaveError] = useState("");
  const countries = useQuery(api.countries.list, {});
  const update = useMutation(api.creators.update);
  const unchanged = birthdate === initialBirthdate && country === initialCountry;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const parsed = parseBirthdate(birthdate);
    if (!parsed.ok) {
      setFieldError(parsed.error);
      birthdateRef.current?.focus();
      return;
    }
    // The API has no way to unset a birthdate, so say so rather than
    // reporting a save that would leave the old date in place.
    if (parsed.value === null && dateOfBirth !== undefined) {
      setFieldError("Your date of birth can't be removed, only corrected.");
      birthdateRef.current?.focus();
      return;
    }
    submitting.current = true;
    setPending(true);
    setSaveError("");
    try {
      await update({
        ...(parsed.value === null ? {} : { dateOfBirth: parsed.value }),
        countryOfResidence: country === "" ? null : country,
      });
      onSaved();
    } catch (error) {
      setSaveError(
        errorMessage(error, {
          invalid_state: "Check your date of birth and country, then try again.",
        }),
      );
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return (
    <form onSubmit={save} noValidate className="space-y-4">
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${id}-birthdate`}>Date of birth</Label>
          <Input
            ref={birthdateRef}
            id={`${id}-birthdate`}
            name="dateOfBirth"
            type="date"
            autoFocus
            max={today}
            className="h-11"
            value={birthdate}
            disabled={pending}
            aria-invalid={!!fieldError}
            aria-describedby={`${id}-birthdate-hint${fieldError ? ` ${id}-birthdate-error` : ""}`}
            onChange={(event) => {
              setBirthdate(event.target.value);
              setFieldError("");
              setSaveError("");
            }}
          />
          <p id={`${id}-birthdate-hint`} className="text-sm text-muted-foreground">
            You must be at least 18 to use Tomoji.
          </p>
          {fieldError && (
            <p id={`${id}-birthdate-error`} role="alert" className="text-sm text-destructive">
              {fieldError}
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${id}-country`}>Country of residence</Label>
          <select
            id={`${id}-country`}
            name="countryOfResidence"
            className="h-11 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
            value={country}
            disabled={pending || countries === undefined}
            onChange={(event) => {
              setCountry(event.target.value);
              setSaveError("");
            }}
          >
            <option value="">Not selected</option>
            {(countries ?? []).map((entry) => (
              <option key={entry.code} value={entry.code}>
                {entry.name}
              </option>
            ))}
          </select>
          <p className="text-sm text-muted-foreground">
            {countries === undefined ? "Loading countries…" : "Where you currently live."}
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
          aria-label="Discard personal details changes"
          variant="outline"
          className="min-h-11"
          disabled={pending}
          onClick={onDiscard}
        >
          Discard changes
        </Button>
        <Button type="submit" className="min-h-11" disabled={pending || unchanged}>
          {pending && <LoaderCircle aria-hidden className="size-4 animate-spin" />}
          {pending ? "Saving personal details…" : "Save personal details"}
        </Button>
      </div>
    </form>
  );
}
