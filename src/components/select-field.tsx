"use client";

import { useId, type ReactNode } from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type SelectOption = { value: string; label: string };

type SelectFieldProps = {
  /** Gray label above the trigger; darkens while the field is focused. */
  label?: ReactNode;
  /** Adds a red asterisk after the label. */
  required?: boolean;
  /** A note under the trigger. Replaced by `error` when there is one. */
  helper?: string;
  /** Turns the trigger red and shows this message below it. */
  error?: string;
  /** Gray text shown while nothing is chosen. */
  placeholder?: string;
  options: SelectOption[];
  value?: string | null;
  defaultValue?: string | null;
  onValueChange?: (value: string | null) => void;
  disabled?: boolean;
  id?: string;
  className?: string;
};

/**
 * Figma "Select" (single): a labelled dropdown field. The open list is a
 * menu of options with a blue check on the chosen one; choosing closes it.
 */
export function SelectField({
  label,
  required,
  helper,
  error,
  placeholder = "Select",
  options,
  value,
  defaultValue,
  onValueChange,
  disabled,
  id,
  className,
}: SelectFieldProps) {
  const generatedId = useId();
  const triggerId = id ?? generatedId;
  const messageId = `${triggerId}-message`;
  const message = error ?? helper;

  return (
    <div className={cn("group flex flex-col gap-2", disabled && "opacity-40", className)}>
      {label && (
        <Label htmlFor={triggerId} className="gap-0.5">
          {label}
          {required && (
            <span aria-hidden className="text-red-600">
              *
            </span>
          )}
        </Label>
      )}
      <Select
        id={triggerId}
        items={options}
        value={value}
        defaultValue={defaultValue}
        onValueChange={onValueChange ? (next) => onValueChange(next) : undefined}
        disabled={disabled}
        required={required}
      >
        <SelectTrigger
          aria-invalid={error ? true : undefined}
          aria-describedby={message ? messageId : undefined}
          className="w-full disabled:opacity-100"
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
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
