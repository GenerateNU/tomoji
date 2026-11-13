"use client";

import type { CSSProperties } from "react";
import { RiAlertFill } from "@remixicon/react";
import { Toaster as Sonner, type ToasterProps } from "sonner";
import { IconContainer } from "@/components/icon-container";

/**
 * Shares accessible toast feedback and the application's color tokens.
 * Styled as Figma's "Toast": a floating card with a tinted status icon, gray
 * message text with the affected item in medium weight (wrap it in a
 * `font-medium` span), a subtle action button, and a close button.
 */
export function Toaster({ style, toastOptions, ...props }: ToasterProps) {
  return (
    <Sonner
      theme="light"
      closeButton
      icons={{
        success: <IconContainer tone="success" />,
        info: <IconContainer tone="neutral" />,
        warning: <IconContainer tone="error" icon={RiAlertFill} />,
        error: <IconContainer tone="error" />,
      }}
      style={
        {
          "--normal-bg": "var(--color-gray-0)",
          "--normal-text": "var(--color-gray-950)",
          "--normal-border": "transparent",
          "--border-radius": "var(--radius)",
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
            "w-max! max-w-[min(calc(100vw-2rem),44rem)]! gap-3! p-3! text-body! shadow-overlay! transition-none!",
          icon: "m-0! size-auto!",
          content: "min-w-0!",
          title: "truncate font-normal! text-gray-700! [&_.font-medium]:text-foreground",
          description: "text-body-sm! text-muted-foreground!",
          // 12px of toast gap plus these margins give Figma's 24px before the
          // actions and 16px between them.
          actionButton:
            "ml-3! h-8.25! shrink-0! rounded-sm! bg-gray-50! px-3! text-body! font-medium! text-foreground! hover:bg-[color-mix(in_srgb,var(--color-gray-50),black_6%)]!",
          closeButton:
            "static! order-last ml-1! size-4! shrink-0! transform-none! border-0! bg-transparent! text-gray-500! hover:bg-transparent! [&_svg]:size-4!",
          ...toastOptions?.classNames,
        },
      }}
      {...props}
    />
  );
}
