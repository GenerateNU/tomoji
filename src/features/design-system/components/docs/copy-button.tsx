"use client";

import { RiCheckLine, RiFileCopyLine } from "@remixicon/react";
import { useEffect, useRef, useState } from "react";
import { iconProps } from "@/lib/icons";
import { focusRing } from "@/lib/styles";
import { cn } from "@/lib/utils";

const COPIED_MS = 1200;

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard access can be denied (insecure context, permissions); there is nothing to recover.
      return;
    }
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), COPIED_MS);
  }

  return (
    <>
      <button
        type="button"
        aria-label="Copy code"
        onClick={copy}
        className={cn("rounded p-1.5 text-gray-500 hover:text-gray-950", focusRing)}
      >
        {copied ? (
          <RiCheckLine {...iconProps} size={14} className="text-blue-primary" />
        ) : (
          <RiFileCopyLine {...iconProps} size={14} />
        )}
      </button>
      <span aria-live="polite" className="sr-only">
        {copied ? "Copied" : ""}
      </span>
    </>
  );
}
