"use client";

import { useId } from "react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Detail } from "./detail";

/**
 * Account identity, all of it read-only. Username and phone number used to be
 * edited here; the fields they wrote are gone, and date of birth, country,
 * links and visibility still need a form of their own.
 */
export function BasicDetailsSection() {
  const headingId = useId();
  const profile = useQuery(api.creators.me, {});

  if (profile === undefined) {
    return <p role="status">Loading basic details…</p>;
  }

  return (
    <section aria-labelledby={headingId} className="space-y-6 rounded-2xl bg-card p-6 sm:p-8">
      <h2 id={headingId} className="text-xl font-semibold tracking-tight">
        Basic details
      </h2>
      <div className="space-y-3">
        <dl className="grid gap-6 sm:grid-cols-2">
          <Detail label="First name" value={profile.firstName} />
          <Detail label="Last name" value={profile.lastName} />
          <div className="min-w-0 space-y-2 sm:col-span-2">
            <dt className="text-sm font-medium">Email</dt>
            <dd className="text-sm break-words">{profile.email}</dd>
          </div>
        </dl>
        <p className="text-sm text-muted-foreground">
          Your name and email can&rsquo;t be changed here.
        </p>
      </div>
    </section>
  );
}
