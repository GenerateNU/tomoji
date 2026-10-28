"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useCountryName } from "../hooks/use-country-name";
import { formatBirthdate } from "../lib/birthdate";
import { Detail } from "./detail";
import { PersonalDetailsForm } from "./personal-details-form";

export function PersonalDetailsSection({
  dateOfBirth,
  countryOfResidence,
}: {
  dateOfBirth?: number;
  countryOfResidence?: string;
}) {
  const headingId = useId();
  const countryName = useCountryName(countryOfResidence);
  const [editing, setEditing] = useState(false);
  const [success, setSuccess] = useState("");
  const editButton = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);

  useEffect(() => {
    if (!editing && wasEditing.current) editButton.current?.focus();
    wasEditing.current = editing;
  }, [editing]);

  return (
    <section aria-labelledby={headingId} className="space-y-6 rounded-2xl bg-card p-6 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 id={headingId} className="text-xl font-semibold tracking-tight">
          Personal details
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
            Edit personal details
          </Button>
        )}
      </div>
      {editing ? (
        <PersonalDetailsForm
          dateOfBirth={dateOfBirth}
          countryOfResidence={countryOfResidence}
          onDiscard={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            setSuccess("Personal details saved.");
          }}
        />
      ) : (
        <dl className="grid gap-6 sm:grid-cols-2">
          <Detail label="Date of birth" value={formatBirthdate(dateOfBirth)} />
          <Detail label="Country of residence" value={countryName} />
        </dl>
      )}
      <p role="status" className="text-sm text-muted-foreground">
        {success}
      </p>
    </section>
  );
}
