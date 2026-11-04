"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { parseAdditionalLinks, parseLinkedinLink } from "../lib/links";
import { ExternalLink } from "./external-link";
import { LinksForm } from "./links-form";

export function LinksSection({
  linkedinLink,
  additionalLinks,
}: {
  linkedinLink?: string;
  additionalLinks: string[];
}) {
  const headingId = useId();
  const [editing, setEditing] = useState(false);
  const [success, setSuccess] = useState("");
  const editButton = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);
  // Saved values predate this form and the API does not URL-validate them.
  const savedLinkedin = parseLinkedinLink(linkedinLink ?? "");
  const savedAdditional = additionalLinks.filter((link) => parseAdditionalLinks([link]).ok);

  useEffect(() => {
    if (!editing && wasEditing.current) editButton.current?.focus();
    wasEditing.current = editing;
  }, [editing]);

  return (
    <section aria-labelledby={headingId} className="space-y-6 rounded-2xl bg-card p-6 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 id={headingId} className="text-xl font-semibold tracking-tight">
          Links
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
            Edit links
          </Button>
        )}
      </div>
      {editing ? (
        <LinksForm
          linkedinLink={linkedinLink ?? ""}
          additionalLinks={additionalLinks}
          onDiscard={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            setSuccess("Links saved.");
          }}
        />
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            <h3 className="text-sm font-medium">LinkedIn</h3>
            {savedLinkedin.ok && savedLinkedin.value ? (
              <ExternalLink href={savedLinkedin.value} />
            ) : (
              <p className="text-sm text-muted-foreground">
                {linkedinLink
                  ? "Your saved link needs updating. Edit it to add a valid LinkedIn URL."
                  : "No LinkedIn profile added yet."}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Other links</h3>
            {savedAdditional.length > 0 ? (
              <ul className="space-y-2">
                {savedAdditional.map((link) => (
                  <li key={link} className="min-w-0">
                    <ExternalLink href={link} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No other links added yet.</p>
            )}
          </div>
        </div>
      )}
      <p role="status" className="text-sm text-muted-foreground">
        {success}
      </p>
    </section>
  );
}
