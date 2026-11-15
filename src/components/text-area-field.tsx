"use client";

import { useId, useState, type ComponentProps } from "react";
import { Label } from "@/components/ui/label";
import { fieldBox, fieldBoxState } from "@/lib/styles";
import { cn } from "@/lib/utils";

type TextAreaFieldProps = ComponentProps<"textarea"> & {
  /** Gray label above the box; darkens while the field is focused. */
  label?: string;
  /** Adds a red asterisk after the label and marks the textarea required. */
  required?: boolean;
  /** A note under the box. Replaced by `error` when there is one. */
  helper?: string;
  /** Turns the box red and shows this message below it. */
  error?: string;
  /** Limits the length and drives the counter. */
  maxLength?: number;
  /** Shows `length/maxLength` when `maxLength` is set. */
  showCount?: boolean;
};

/**
 * Figma "Text Area": a labelled multi-line input with the same states as
 * TextField, an optional helper and a character counter. `className` styles the
 * whole field; other props pass to the native textarea.
 */
export function TextAreaField({
  label,
  required,
  helper,
  error,
  maxLength,
  showCount = true,
  id,
  disabled,
  className,
  value,
  defaultValue,
  onChange,
  rows = 4,
  ...textareaProps
}: TextAreaFieldProps) {
  const generatedId = useId();
  const textareaId = id ?? generatedId;
  const messageId = `${textareaId}-message`;
  const [typedLength, setTypedLength] = useState(String(defaultValue ?? "").length);
  const length = value !== undefined ? String(value).length : typedLength;
  const message = error ?? helper;
  const counting = showCount && maxLength !== undefined;

  return (
    <div className={cn("group flex flex-col gap-2", disabled && "opacity-40", className)}>
      {label && (
        <Label htmlFor={textareaId} className="gap-0.5">
          {label}
          {required && (
            <span aria-hidden className="text-red-600">
              *
            </span>
          )}
        </Label>
      )}
      <div className={cn(fieldBox, fieldBoxState(!!error), "p-3")}>
        <textarea
          id={textareaId}
          rows={rows}
          value={value}
          defaultValue={defaultValue}
          maxLength={maxLength}
          required={required}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={message ? messageId : undefined}
          onChange={(event) => {
            setTypedLength(event.target.value.length);
            onChange?.(event);
          }}
          className="min-h-24 w-full resize-y bg-transparent text-body font-normal text-gray-950 outline-none placeholder:text-gray-400 disabled:cursor-not-allowed"
          {...textareaProps}
        />
      </div>
      {(message || counting) && (
        <div className="flex items-start gap-2">
          <p
            id={messageId}
            className={cn(
              "flex-1 text-body-sm font-normal",
              error ? "text-red-600" : "text-gray-500",
            )}
          >
            {message}
          </p>
          {counting && (
            <span className="text-body-xs font-normal text-gray-500 tabular-nums">
              {length}/{maxLength}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
