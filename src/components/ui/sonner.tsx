"use client";

import type { CSSProperties } from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

/** Shares accessible toast feedback and the application's color tokens. */
export function Toaster({ style, ...props }: ToasterProps) {
  return (
    <Sonner
      theme="system"
      closeButton
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
          ...style,
        } as CSSProperties
      }
      {...props}
    />
  );
}
