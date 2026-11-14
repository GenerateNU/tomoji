"use client";

import { useId, useState, type ReactNode } from "react";
import { focusRing } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { CodeBlock } from "./code-block";
import { CopyButton } from "./copy-button";

export function Example({
  title,
  description,
  code,
  className,
  canvasClassName,
  children,
}: {
  title?: string;
  description?: string;
  code?: string;
  className?: string;
  canvasClassName?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const codeId = useId();

  return (
    <div className={cn("mt-6 first:mt-0", className)}>
      {title ? <h3 className="text-body font-medium text-gray-950">{title}</h3> : null}
      {description ? (
        <p className="mt-1 text-body-sm font-normal leading-[1.5] text-gray-500">{description}</p>
      ) : null}
      <div className={cn("overflow-hidden rounded-lg border border-gray-100", title && "mt-3")}>
        <div
          className={cn(
            "flex min-h-40 flex-wrap items-center justify-center gap-4 overflow-x-auto bg-gray-0 bg-[radial-gradient(var(--dot)_1px,transparent_1px)] p-8 [--dot:var(--color-gray-100)] [background-size:16px_16px]",
            canvasClassName,
          )}
        >
          {children}
        </div>
        {code ? (
          <div className="border-t border-gray-100 bg-gray-25">
            <div className="flex items-center justify-between px-3 py-1.5">
              <button
                type="button"
                aria-expanded={open}
                aria-controls={codeId}
                onClick={() => setOpen((value) => !value)}
                className={cn(
                  "rounded px-2 py-1 text-body-xs font-medium text-gray-500 hover:text-gray-950",
                  focusRing,
                )}
              >
                {open ? "Hide code" : "Show code"}
              </button>
              <CopyButton text={code.trim()} />
            </div>
            <div id={codeId} hidden={!open}>
              <CodeBlock code={code} className="border-t border-gray-100" />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
