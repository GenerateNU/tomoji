"use client";

import { Popover } from "@base-ui/react/popover";
import { RiArrowDownSLine, RiSearchLine } from "@remixicon/react";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { SelectOption } from "@/components/select-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckboxIndicator } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { iconProps } from "@/lib/icons";
import { cn } from "@/lib/utils";

type MultiSelectFieldProps = {
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
  /** Placeholder of the search row in the open panel. */
  searchPlaceholder?: string;
  options: SelectOption[];
  value?: string[];
  defaultValue?: string[];
  onValueChange?: (value: string[]) => void;
  disabled?: boolean;
  className?: string;
};

const noValues: string[] = [];

/**
 * Figma "Select" (multi): chosen values show as removable tags in the trigger.
 * The open panel has a search row, checkbox options, and a footer with the
 * count, Clear and Done. The panel stays open while options toggle, and the
 * search text is kept when it reopens.
 */
export function MultiSelectField({
  label,
  required,
  helper,
  error,
  placeholder = "Select",
  searchPlaceholder = "Search",
  options,
  value,
  defaultValue = noValues,
  onValueChange,
  disabled,
  className,
}: MultiSelectFieldProps) {
  const labelId = useId();
  const messageId = useId();
  const [internal, setInternal] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = value ?? internal;
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const focusAfterRemove = useRef<number | null>(null);
  const message = error ?? helper;
  const hasValues = selected.length > 0;

  function commit(next: string[]) {
    if (value === undefined) setInternal(next);
    onValueChange?.(next);
  }

  function toggle(optionValue: string) {
    commit(
      selected.includes(optionValue)
        ? selected.filter((item) => item !== optionValue)
        : [...selected, optionValue],
    );
  }

  function remove(optionValue: string, index: number) {
    focusAfterRemove.current = index;
    commit(selected.filter((item) => item !== optionValue));
  }

  // Removing a tag unmounts the button that had focus. Move focus to the next
  // tag's remove button, or to the trigger when none is left.
  useEffect(() => {
    const index = focusAfterRemove.current;
    if (index === null) return;
    focusAfterRemove.current = null;
    const buttons = triggerRef.current?.querySelectorAll<HTMLButtonElement>("button");
    const next = buttons?.[Math.min(index, buttons.length - 1)];
    (next ?? triggerRef.current)?.focus();
  }, [selected]);

  function onTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" && event.target === event.currentTarget && !open) {
      event.preventDefault();
      setOpen(true);
    }
  }

  const needle = query.trim().toLowerCase();
  const visible = needle
    ? options.filter((option) => option.label.toLowerCase().includes(needle))
    : options;
  const labelOf = (optionValue: string) =>
    options.find((option) => option.value === optionValue)?.label ?? optionValue;

  return (
    <div
      ref={wrapperRef}
      className={cn("group flex flex-col gap-2", disabled && "opacity-40", className)}
    >
      {label && (
        <Label id={labelId} className="gap-0.5" onClick={() => triggerRef.current?.focus()}>
          {label}
          {required && (
            <span aria-hidden className="text-red-600">
              *
            </span>
          )}
        </Label>
      )}
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger
          ref={triggerRef}
          nativeButton={false}
          disabled={disabled}
          render={<div />}
          role="combobox"
          aria-expanded={open}
          aria-labelledby={label ? labelId : undefined}
          aria-describedby={message ? messageId : undefined}
          aria-invalid={error ? true : undefined}
          aria-disabled={disabled || undefined}
          onKeyDown={onTriggerKeyDown}
          className={cn(
            "flex w-full gap-2 rounded border px-3 transition-shadow outline-none focus-visible:ring-4 focus-visible:ring-blue-primary/25",
            hasValues ? "items-start py-2" : "items-center py-3",
            disabled ? "cursor-not-allowed" : "cursor-pointer",
            error
              ? "border-red-600 bg-red-50 outline -outline-offset-2 outline-red-600"
              : open
                ? "border-blue-primary bg-gray-0 outline -outline-offset-2 outline-blue-primary"
                : "border-gray-300 bg-gray-0 focus-visible:border-blue-primary focus-visible:outline focus-visible:-outline-offset-2 focus-visible:outline-blue-primary",
          )}
        >
          {hasValues ? (
            <span className="flex flex-1 flex-wrap gap-1.5">
              {selected.map((item, index) => (
                <Badge
                  key={item}
                  size="md"
                  removeLabel={`Remove ${labelOf(item)}`}
                  onRemove={disabled ? undefined : () => remove(item, index)}
                >
                  {labelOf(item)}
                </Badge>
              ))}
            </span>
          ) : (
            <span className="flex-1 truncate text-body font-normal text-gray-400">
              {placeholder}
            </span>
          )}
          <RiArrowDownSLine
            {...iconProps}
            className={cn(
              "shrink-0 text-gray-500 transition-transform",
              hasValues && "mt-2",
              open && "rotate-180",
            )}
          />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner
            anchor={wrapperRef}
            side="bottom"
            align="start"
            sideOffset={6}
            className="isolate z-50"
          >
            <Popover.Popup
              initialFocus={searchRef}
              aria-label={typeof label === "string" ? label : "Options"}
              className="flex w-(--anchor-width) min-w-60 flex-col gap-0.5 rounded-lg border border-gray-100 bg-background p-1.5 text-gray-950 shadow-overlay outline-none"
            >
              <label className="flex items-center gap-2 p-2">
                <RiSearchLine {...iconProps} className="shrink-0 text-gray-400" />
                <input
                  ref={searchRef}
                  type="text"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={searchPlaceholder}
                  aria-label={searchPlaceholder}
                  className="w-full bg-transparent text-body-sm font-normal text-gray-950 outline-none placeholder:text-gray-400"
                />
              </label>
              <div className="px-2 py-1">
                <div className="h-px bg-gray-100" />
              </div>
              <div
                role="group"
                aria-label={typeof label === "string" ? label : "Options"}
                className="flex max-h-60 flex-col gap-0.5 overflow-y-auto"
              >
                {visible.length === 0 ? (
                  <p className="p-2 text-body-sm font-normal text-gray-400">No matches</p>
                ) : (
                  visible.map((option) => {
                    const checked = selected.includes(option.value);
                    return (
                      <button
                        key={option.value}
                        type="button"
                        role="checkbox"
                        aria-checked={checked}
                        onClick={() => toggle(option.value)}
                        className="flex w-full cursor-pointer items-center gap-2 rounded-sm p-2 text-left text-body font-normal text-gray-950 transition-colors outline-none hover:bg-gray-50 focus-visible:ring-4 focus-visible:ring-blue-primary/25"
                      >
                        <CheckboxIndicator checked={checked} interactive={false} />
                        <span className="min-w-0 flex-1 truncate">{option.label}</span>
                      </button>
                    );
                  })
                )}
              </div>
              <div className="px-2 py-1">
                <div className="h-px bg-gray-100" />
              </div>
              <div className="flex items-center gap-2 px-2 py-1.5">
                <span aria-live="polite" className="flex-1 text-body-sm font-normal text-gray-500">
                  {selected.length} selected
                </span>
                <Button variant="secondary-ghost" size="sm" onClick={() => commit([])}>
                  Clear
                </Button>
                <Button size="sm" onClick={() => setOpen(false)}>
                  Done
                </Button>
              </div>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
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
