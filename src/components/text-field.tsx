"use client";

import { useId, type ComponentProps, type ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { iconProps, type IconComponent } from "@/lib/icons";
import { fieldBox, fieldBoxState } from "@/lib/styles";
import { cn } from "@/lib/utils";

type TextFieldProps = Omit<ComponentProps<"input">, "children"> & {
  /** Gray label above the box; darkens while the field is focused. */
  label?: string;
  /** Adds a red asterisk after the label and marks the input required. */
  required?: boolean;
  /** A note under the box. Replaced by `error` when there is one. */
  helper?: string;
  /** Turns the box red and shows this message below it. */
  error?: string;
  /** A leading Remix icon. */
  icon?: IconComponent;
  /** Content after the input, e.g. a unit or a small button. */
  trailing?: ReactNode;
};

/**
 * Figma "Text Field": a labelled single-line input. The box turns blue with a
 * soft ring on focus, and red with a message below it on error. `className`
 * styles the whole field; other props pass to the native input.
 */
export function TextField({
  label,
  required,
  helper,
  error,
  icon: Icon,
  trailing,
  id,
  disabled,
  className,
  ...inputProps
}: TextFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const messageId = `${inputId}-message`;
  const message = error ?? helper;

  return (
    <div className={cn("group flex flex-col gap-2", disabled && "opacity-40", className)}>
      {label && (
        <Label htmlFor={inputId} className="gap-0.5">
          {label}
          {required && (
            <span aria-hidden className="text-red-600">
              *
            </span>
          )}
        </Label>
      )}
      <div className={cn(fieldBox, fieldBoxState(!!error), "items-center gap-2 p-3")}>
        {Icon && <Icon {...iconProps} className="shrink-0 text-gray-950" />}
        <input
          id={inputId}
          required={required}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={message ? messageId : undefined}
          className="w-full min-w-0 bg-transparent text-body font-normal text-gray-950 outline-none placeholder:text-gray-400 disabled:cursor-not-allowed"
          {...inputProps}
        />
        {trailing}
      </div>
      {message && (
        <p
          id={messageId}
          className={cn("text-body-sm font-normal", error ? "text-red-600" : "text-gray-500")}
        >
          {message}
        </p>
      )}
    </div>
  );
}
