"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { parseGithubLink } from "../lib/github-link";
import { ExternalLink } from "./external-link";
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
            variant="outline"
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
            <ExternalLink href={savedLink.value} />
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
