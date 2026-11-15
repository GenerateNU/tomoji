"use client";

import { RiUpload2Line } from "@remixicon/react";
import { useId, useRef } from "react";
import { Tag } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { iconProps } from "@/lib/icons";
import { fieldBox, fieldBoxState, focusRing } from "@/lib/styles";
import { cn } from "@/lib/utils";

// Mirrors the backend's `dispute-evidence` rules in convex/lib/s3.ts and
// MAX_DISPUTE_EVIDENCE.
export const EVIDENCE_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
export const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;
export const MAX_EVIDENCE_FILES = 10;

/** The files to add, or why they can't be. */
export function checkEvidence(current: File[], added: File[]): File[] | string {
  if (added.some((file) => !EVIDENCE_TYPES.includes(file.type))) {
    return "Upload images (JPEG, PNG or WebP) or PDFs.";
  }
  if (added.some((file) => file.size === 0 || file.size > MAX_EVIDENCE_BYTES)) {
    return "Each file must be 10 MB or smaller.";
  }
  if (current.length + added.length > MAX_EVIDENCE_FILES) {
    return `Attach up to ${MAX_EVIDENCE_FILES} files.`;
  }
  return [...current, ...added];
}

export function EvidenceField({
  files,
  onFilesChange,
  onReject,
  error,
  disabled,
}: {
  files: File[];
  onFilesChange: (files: File[]) => void;
  onReject: (message: string) => void;
  error?: string;
  disabled?: boolean;
}) {
  const labelId = useId();
  const messageId = useId();
  const input = useRef<HTMLInputElement>(null);

  function add(list: FileList | null) {
    if (!list || list.length === 0) return;
    const result = checkEvidence(files, [...list]);
    if (typeof result === "string") onReject(result);
    else onFilesChange(result);
  }

  return (
    <div className="group flex flex-col gap-2">
      <span id={labelId} className="flex gap-0.5 text-body-sm font-medium text-gray-500">
        Evidence
        <span aria-hidden className="text-gray-500">
          *
        </span>
      </span>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        accept={EVIDENCE_TYPES.join(",")}
        onChange={(event) => {
          add(event.target.files);
          // Lets the same file be picked again after it's removed.
          event.target.value = "";
        }}
      />
      {files.length === 0 ? (
        <button
          type="button"
          disabled={disabled}
          aria-labelledby={labelId}
          aria-describedby={error ? messageId : undefined}
          onClick={() => input.current?.click()}
          className={cn(
            fieldBox,
            fieldBoxState(!!error),
            "cursor-pointer items-center gap-2 p-3 text-left disabled:cursor-not-allowed",
            focusRing,
          )}
        >
          <span className="flex-1 text-body font-normal text-gray-400">Upload evidence</span>
          <RiUpload2Line {...iconProps} className="shrink-0 text-gray-500" />
        </button>
      ) : (
        <div
          role="group"
          aria-labelledby={labelId}
          className={cn(fieldBox, fieldBoxState(!!error), "flex-wrap items-center gap-1.5 p-2")}
        >
          {files.map((file, index) => (
            <Tag
              key={`${file.name}-${index}`}
              size="md"
              removeLabel={`Remove ${file.name}`}
              onRemove={
                disabled ? undefined : () => onFilesChange(files.filter((_, i) => i !== index))
              }
              className="max-w-full"
            >
              <span className="truncate">{file.name}</span>
            </Tag>
          ))}
          {files.length < MAX_EVIDENCE_FILES && (
            <Button
              type="button"
              size="sm"
              variant="secondary-ghost"
              disabled={disabled}
              onClick={() => input.current?.click()}
            >
              <RiUpload2Line {...iconProps} />
              Add files
            </Button>
          )}
        </div>
      )}
      <p
        id={messageId}
        className={cn("text-body-sm font-normal", error ? "text-red-600" : "text-gray-500")}
      >
        {error ?? "Images or PDFs, up to 10 MB each."}
      </p>
    </div>
  );
}
