"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FormField } from "@/features/auth/components/form-field";
import { errorMessage } from "@/lib/errors";
import { briefFields, parseCampaignDraft } from "../lib/draft";

/** Creates a complete draft brief; publishing and opportunity creation remain separate actions. */
export function DraftForm() {
  const create = useMutation(api.campaigns.create);
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  /** Keeps validation errors local and maps service errors without exposing backend details. */
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    let draft;
    try {
      draft = parseCampaignDraft(new FormData(event.currentTarget));
    } catch (error) {
      setError(error instanceof Error ? error.message : "Check your campaign details.");
      return;
    }
    inFlight.current = true;
    setPending(true);
    setError(null);
    try {
      await create(draft);
      setSaved(true);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-7 px-5 py-10 sm:px-10">
      <Link
        href="/campaigns"
        className="inline-flex min-h-11 items-center rounded-md text-sm underline underline-offset-4 focus-visible:outline-2"
      >
        Back to campaigns
      </Link>
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">Create campaign</h1>
        <p className="text-muted-foreground">
          Set up your campaign&apos;s basic information. This saves a draft, not a published
          campaign.
        </p>
      </header>
      {saved ? (
        <div role="status" className="space-y-3 rounded-xl border p-6">
          <h2 className="text-xl font-semibold">Campaign draft saved</h2>
          <p>The campaign is not open to creators yet.</p>
          <Link
            href="/campaigns"
            className="inline-flex min-h-11 items-center underline underline-offset-4"
          >
            View campaigns
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-6 rounded-xl bg-muted/50 p-5 sm:p-8">
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <fieldset disabled={pending} className="grid min-w-0 gap-6 sm:grid-cols-2">
            {Object.entries(briefFields).map(([name, label]) =>
              name === "description" ? (
                <div key={name} className="grid gap-2 sm:col-span-2">
                  <Label htmlFor="campaign-description">{label}</Label>
                  <textarea
                    id="campaign-description"
                    name={name}
                    required
                    rows={4}
                    className="w-full rounded-lg border bg-background p-3 text-base focus-visible:outline-2 focus-visible:outline-offset-2"
                  />
                </div>
              ) : (
                <FormField
                  key={name}
                  name={name}
                  label={label}
                  required
                  className="min-h-11 bg-background"
                />
              ),
            )}
            <FormField
              name="budget"
              label="Budget (USD)"
              inputMode="decimal"
              required
              placeholder="0.00"
              hint="Nonnegative amount, up to two decimal places."
              className="min-h-11 bg-background"
            />
            <FormField
              name="startsAt"
              label="Start (UTC)"
              type="datetime-local"
              step={60}
              required
              className="min-h-11 bg-background"
            />
            <FormField
              name="endsAt"
              label="End (UTC, optional)"
              type="datetime-local"
              step={1800}
              hint="Choose :00 or :30 UTC, after the start."
              className="min-h-11 bg-background"
            />
          </fieldset>
          <Button type="submit" disabled={pending} className="min-h-11">
            {pending ? "Saving…" : "Save draft"}
          </Button>
        </form>
      )}
    </div>
  );
}
