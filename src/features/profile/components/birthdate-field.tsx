"use client";

import { Fragment, useRef } from "react";
import { RiCalendarLine } from "@remixicon/react";
import { Label } from "@/components/ui/label";
import { toDateInputValue } from "../lib/birthdate";

const SEGMENTS = [
  { label: "Month", placeholder: "MM", length: 2, autoComplete: "bday-month" },
  { label: "Day", placeholder: "DD", length: 2, autoComplete: "bday-day" },
  { label: "Year", placeholder: "YYYY", length: 4, autoComplete: "bday-year" },
] as const;

export function BirthdateField({
  id,
  value,
  onValueChange,
  disabled,
  error,
  autoFocus,
}: {
  id: string;
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  error?: string;
  autoFocus?: boolean;
}) {
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const calendar = useRef<HTMLInputElement>(null);
  const parts = value.split("/");
  const isoDate = /^\d{2}\/\d{2}\/\d{4}$/.test(value) ? `${parts[2]}-${parts[0]}-${parts[1]}` : "";
  const timestamp = Date.parse(`${isoDate}T00:00:00.000Z`);
  const pickerValue =
    Number.isFinite(timestamp) && toDateInputValue(timestamp) === value ? isoDate : "";

  function focusSegment(index: number) {
    inputs.current[index]?.focus();
    inputs.current[index]?.select();
  }

  function updateSegment(index: number, part: string) {
    const next = SEGMENTS.map((_, item) => (item === index ? part : (parts[item] ?? "")));
    onValueChange(next.every((entry) => entry === "") ? "" : next.join("/"));
  }

  return (
    <div className="group space-y-2" data-disabled={disabled || undefined}>
      <Label id={`${id}-label`} htmlFor={`${id}-0`}>
        Date of birth
      </Label>
      <div
        role="group"
        aria-labelledby={`${id}-label`}
        aria-describedby={error ? `${id}-message` : undefined}
        data-invalid={!!error}
        data-disabled={disabled || undefined}
        className="flex h-11.75 items-center rounded-sm border border-gray-300 bg-gray-0 px-2.5 text-body transition-shadow focus-within:border-blue-primary focus-within:inset-ring focus-within:inset-ring-blue-primary focus-within:ring-4 focus-within:ring-blue-primary/25 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40 data-[invalid=true]:border-red-600 data-[invalid=true]:bg-red-50 data-[invalid=true]:inset-ring data-[invalid=true]:inset-ring-red-600 data-[invalid=true]:focus-within:ring-red-600/25"
        onClick={(event) => {
          if (event.target === event.currentTarget) focusSegment(0);
        }}
      >
        <span className="relative mr-2 size-7 shrink-0">
          <button
            type="button"
            aria-label="Choose date of birth"
            disabled={disabled}
            className="flex size-full cursor-pointer items-center justify-center rounded-sm focus-visible:outline-2 focus-visible:outline-blue-primary disabled:cursor-not-allowed"
            onClick={() => calendar.current?.showPicker()}
          >
            <RiCalendarLine aria-hidden="true" className="size-5" />
          </button>
          <input
            ref={calendar}
            type="date"
            aria-label="Date of birth calendar"
            aria-describedby={error ? `${id}-message` : undefined}
            value={pickerValue}
            disabled={disabled}
            tabIndex={-1}
            className="sr-only pointer-events-none"
            onChange={(event) => {
              const date = event.currentTarget.value;
              if (!date) {
                onValueChange("");
                return;
              }
              const [year, month, day] = date.split("-");
              onValueChange(`${month}/${day}/${year}`);
            }}
          />
        </span>
        {SEGMENTS.map((segment, index) => (
          <Fragment key={segment.label}>
            {index > 0 && (
              <span aria-hidden="true" className="select-none">
                /
              </span>
            )}
            <span className="relative h-full shrink-0 tabular-nums">
              {/* Measure the displayed glyphs, including placeholders, without fixed gaps. */}
              <span aria-hidden="true" className="invisible whitespace-pre pr-px">
                {parts[index] || segment.placeholder}
              </span>
              <input
                ref={(input) => {
                  inputs.current[index] = input;
                }}
                id={`${id}-${index}`}
                name={`dateOfBirth.${segment.label.toLowerCase()}`}
                type="text"
                inputMode="numeric"
                autoComplete={segment.autoComplete}
                aria-label={segment.label}
                aria-invalid={!!error}
                aria-describedby={error ? `${id}-message` : undefined}
                placeholder={segment.placeholder}
                maxLength={segment.length}
                value={parts[index] ?? ""}
                disabled={disabled}
                autoFocus={autoFocus && index === 0}
                className="absolute inset-0 h-full w-full min-w-0 border-0 bg-transparent p-0 text-left text-body tabular-nums outline-none placeholder:text-gray-400 disabled:cursor-not-allowed"
                onFocus={(event) => event.currentTarget.select()}
                onClick={(event) => event.currentTarget.select()}
                onChange={(event) => {
                  const next = event.currentTarget.value;
                  if (!/^\d*$/.test(next)) return;
                  updateSegment(index, next);
                  const deleting = (event.nativeEvent as InputEvent).inputType?.startsWith(
                    "delete",
                  );
                  if (!deleting && next.length === segment.length && index < SEGMENTS.length - 1)
                    focusSegment(index + 1);
                }}
                onKeyDown={(event) => {
                  // Separators are fixed; typing one must not advance a second time.
                  if (event.key === "/") {
                    event.preventDefault();
                    return;
                  }
                  const input = event.currentTarget;
                  const atStart = input.selectionStart === 0 && input.selectionEnd === 0;
                  const atEnd =
                    input.selectionStart === input.value.length &&
                    input.selectionEnd === input.value.length;
                  if (
                    index > 0 &&
                    ((event.key === "Backspace" && input.value === "") ||
                      (event.key === "ArrowLeft" && atStart))
                  ) {
                    event.preventDefault();
                    focusSegment(index - 1);
                  } else if (event.key === "ArrowRight" && atEnd) {
                    event.preventDefault();
                    if (index < SEGMENTS.length - 1) focusSegment(index + 1);
                  }
                }}
                onPaste={(event) => {
                  const text = event.clipboardData.getData("text").trim();
                  const date = /^(\d{1,2})\/(\d{1,2})\/(\d{1,4})$/.exec(text);
                  const digits = /^(\d{2})(\d{2})(\d{4})$/.exec(text);
                  const match = date ?? digits;
                  if (match) {
                    event.preventDefault();
                    onValueChange(match.slice(1).join("/"));
                    focusSegment(2);
                  }
                }}
              />
            </span>
          </Fragment>
        ))}
      </div>
      {error && (
        <p id={`${id}-message`} role="alert" className="text-body-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
