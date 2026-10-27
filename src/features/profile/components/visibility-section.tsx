"use client";

import { useId, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { errorMessage } from "@/lib/errors";

export function VisibilitySection({ isPrivate }: { isPrivate: boolean }) {
  const headingId = useId();
  const switchId = useId();
  const saving = useRef(false);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const update = useMutation(api.creators.update);

  async function toggle(checked: boolean) {
    if (saving.current) return;
    saving.current = true;
    setPending(true);
    setError("");
    setStatus("");
    try {
      await update({ isPrivate: checked });
      setStatus(checked ? "Your profile is now private." : "Your profile is now discoverable.");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      saving.current = false;
      setPending(false);
    }
  }

  return (
    <section aria-labelledby={headingId} className="space-y-6 rounded-2xl bg-card p-6 sm:p-8">
      <h2 id={headingId} className="text-xl font-semibold tracking-tight">
        Profile visibility
      </h2>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <Label htmlFor={switchId}>Private profile</Label>
          <p id={`${switchId}-hint`} className="max-w-prose text-sm text-muted-foreground">
            Companies browsing for creators won&rsquo;t see your profile. Companies you have applied
            to, or that have assigned you work, still can.
          </p>
        </div>
        <Switch
          id={switchId}
          checked={isPrivate}
          disabled={pending}
          aria-describedby={`${switchId}-hint`}
          onCheckedChange={toggle}
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <p role="status" className="text-sm text-muted-foreground">
        {status}
      </p>
    </section>
  );
}
