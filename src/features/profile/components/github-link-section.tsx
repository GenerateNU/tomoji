"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { parseGithubLink } from "../lib/github-link";
import { GithubLinkForm } from "./github-link-form";

export function GithubLinkSection({ githubLink }: { githubLink?: string }) {
  const headingId = useId();
  const [editing, setEditing] = useState(false);
  const [success, setSuccess] = useState("");
  const editButton = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);
  const savedLink = parseGithubLink(githubLink ?? "");

  useEffect(() => {
    if (!editing && wasEditing.current) editButton.current?.focus();
    wasEditing.current = editing;
  }, [editing]);

  return (
    <section aria-labelledby={headingId} className="min-w-0">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h3 id={headingId} className="font-semibold">
          GitHub profile
        </h3>
        {!editing && (
          <Button
            ref={editButton}
            variant="secondary"
            className="min-h-11"
            onClick={() => {
              setSuccess("");
              setEditing(true);
            }}
          >
            {githubLink ? "Edit GitHub profile" : "Add GitHub profile"}
          </Button>
        )}
      </div>
      {editing ? (
        <GithubLinkForm
          initialValue={githubLink ?? ""}
          onDiscard={() => setEditing(false)}
          onSaved={(cleared) => {
            setEditing(false);
            setSuccess(cleared ? "GitHub profile removed." : "GitHub profile saved.");
          }}
        />
      ) : (
        <div className="space-y-2">
          {savedLink.ok && savedLink.value ? (
            <a
              href={savedLink.value}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex max-w-full items-center gap-2 rounded text-sm underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="min-w-0 break-all">{savedLink.value}</span>
              <ExternalLink aria-hidden className="size-4 shrink-0" />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          ) : githubLink ? (
            <p className="text-sm text-muted-foreground">
              Your saved link needs updating. Edit it to add a valid GitHub URL.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">No GitHub profile added yet.</p>
          )}
        </div>
      )}
      <p role="status" className="mt-3 text-sm text-muted-foreground">
        {success}
      </p>
    </section>
  );
}
