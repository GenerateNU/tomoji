"use client";

import { Combobox } from "@base-ui/react/combobox";
import { api } from "@convex/_generated/api";
import { RiSearchLine } from "@remixicon/react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useId, useRef, useState } from "react";
import {
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { Label } from "@/components/ui/label";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { iconProps } from "@/lib/icons";
import { fieldBox, fieldBoxState } from "@/lib/styles";
import { cn } from "@/lib/utils";

export type AssignmentOption = FunctionReturnType<typeof api.assignments.searchMine>[number];

export function AssignmentPicker({
  value,
  onValueChange,
  error,
}: {
  value: AssignmentOption | null;
  onValueChange: (value: AssignmentOption | null) => void;
  error?: string;
}) {
  const inputId = useId();
  const messageId = `${inputId}-message`;
  const anchorRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState("");
  const companyName = useDebouncedValue(search.trim());
  const options = useQuery(api.assignments.searchMine, { companyName });

  return (
    <div className="group flex flex-col gap-2">
      <Label htmlFor={inputId} className="gap-0.5">
        Assignment
        <span aria-hidden className="text-gray-500">
          *
        </span>
      </Label>
      <Combobox.Root
        items={options ?? []}
        // Filtered on the server.
        filter={null}
        value={value}
        onValueChange={onValueChange}
        inputValue={search}
        onInputValueChange={setSearch}
        itemToStringLabel={(option: AssignmentOption) => option.companyName}
        isItemEqualToValue={(a: AssignmentOption, b: AssignmentOption) =>
          a.assignmentId === b.assignmentId
        }
      >
        <div
          ref={anchorRef}
          className={cn(fieldBox, fieldBoxState(!!error), "items-center gap-2 p-3")}
        >
          <RiSearchLine {...iconProps} className="shrink-0 text-gray-950" />
          <Combobox.Input
            id={inputId}
            placeholder="Search by company name"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? messageId : undefined}
            className="w-full min-w-0 bg-transparent text-body font-normal text-gray-950 outline-none placeholder:text-gray-400"
          />
        </div>
        <ComboboxContent anchor={anchorRef}>
          <ComboboxEmpty>
            {options === undefined
              ? "Searching…"
              : search.trim()
                ? "None of your assignments match that company."
                : "You don't have any assignments yet."}
          </ComboboxEmpty>
          <ComboboxList>
            {(option: AssignmentOption) => (
              <ComboboxItem key={option.assignmentId} value={option}>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{option.companyName}</span>
                  <span className="truncate text-body-sm text-gray-500">
                    {option.opportunityTitle}
                  </span>
                </span>
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox.Root>
      {error && (
        <p id={messageId} className="text-body-sm font-normal text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
