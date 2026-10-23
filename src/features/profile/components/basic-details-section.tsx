"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Detail } from "./detail";
import { BasicDetailsForm } from "./basic-details-form";

export function BasicDetailsSection() {
  const headingId = useId();
  const profile = useQuery(api.creators.me, {});
  const [editing, setEditing] = useState(false);
  const [success, setSuccess] = useState("");
  const editButton = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);

  useEffect(() => {
    if (!editing && wasEditing.current) editButton.current?.focus();
    wasEditing.current = editing;
  }, [editing]);

  if (profile === undefined) {
    return <p role="status">Loading basic details…</p>;
  }

  return (
    <section aria-labelledby={headingId} className="space-y-6 rounded-2xl bg-card p-6 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 id={headingId} className="text-xl font-semibold tracking-tight">
          Basic details
        </h2>
        {!editing && (
          <Button
            ref={editButton}
            variant="outline"
            className="min-h-11"
            onClick={() => {
              setSuccess("");
              setEditing(true);
            }}
          >
            Edit basic details
          </Button>
        )}
      </div>
      <div className="space-y-3">
        <dl className="grid gap-6 sm:grid-cols-2">
          <Detail label="First name" value={profile.firstName} />
          <Detail label="Last name" value={profile.lastName} />
          <div className="min-w-0 space-y-2 sm:col-span-2">
            <dt className="text-sm font-medium">Email</dt>
            <dd className="text-sm break-words">{profile.email}</dd>
          </div>
        </dl>
        <p className="text-sm text-muted-foreground">Your name and email can’t be changed here.</p>
      </div>
      {editing ? (
        <BasicDetailsForm
          username={profile.username}
          phoneNumber={profile.phoneNumber}
          onDiscard={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            setSuccess("Basic details saved.");
          }}
        />
      ) : (
        <dl className="grid gap-6 sm:grid-cols-2">
          <Detail label="Username" value={profile.username} />
          <Detail label="Phone number" value={profile.phoneNumber} />
        </dl>
      )}
      <p role="status" className="text-sm text-muted-foreground">
        {success}
      </p>
    </section>
  );
}
