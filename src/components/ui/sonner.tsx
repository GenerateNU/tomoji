"use client";

import type { CSSProperties } from "react";
import { CheckIcon, CircleAlertIcon, InfoIcon, TriangleAlertIcon } from "lucide-react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

/**
 * Shares accessible toast feedback and the application's color tokens.
 * Styled as Figma's "Toast": a borderless floating card with a text action.
 */
export function Toaster({ style, toastOptions, ...props }: ToasterProps) {
  return (
    <Sonner
      theme="system"
      closeButton
      icons={{
        success: <CheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <CircleAlertIcon className="size-4 text-destructive" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "transparent",
          "--border-radius": "calc(var(--radius) * 1.5)",
          ...style,
        } as CSSProperties
      }
      // Sonner's own styles are more specific than utilities, hence the `!`s.
      // Figma's toast is one line as wide as its message (Sonner fixes the
      // width), truncating a long item name, with the close button inline.
      toastOptions={{
        ...toastOptions,
        classNames: {
          toast:
            "w-max! max-w-[min(calc(100vw-2rem),44rem)]! gap-3! py-4! pr-4! pl-5! text-body! shadow-overlay!",
          content: "min-w-0!",
          title: "truncate font-normal!",
          description: "text-body-sm! text-muted-foreground!",
          actionButton:
            "ml-0! h-auto! shrink-0! bg-transparent! p-0! text-body! font-medium! text-foreground!",
          closeButton:
            "static! order-last size-4! shrink-0! transform-none! border-0! bg-transparent! text-foreground! hover:bg-transparent! [&_svg]:size-4!",
          ...toastOptions?.classNames,
        },
      }}
      {...props}
    />
  );
}
