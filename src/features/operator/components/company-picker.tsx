"use client";

import { Combobox } from "@base-ui/react/combobox";
import { api } from "@convex/_generated/api";
import { RiSearchLine } from "@remixicon/react";
import { usePaginatedQuery } from "convex/react";
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
import type { DirectoryCompany } from "../lib/labels";

/** Picks one active company by name. Matching happens on the server. */
export function CompanyPicker({
  value,
  onValueChange,
  error,
}: {
  value: DirectoryCompany | null;
  onValueChange: (value: DirectoryCompany | null) => void;
  error?: string;
}) {
  const inputId = useId();
  const messageId = `${inputId}-message`;
  const anchorRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search.trim());
  const { results } = usePaginatedQuery(
    api.companies.list,
    { isActive: true, search: debounced },
    { initialNumItems: 20 },
  );

  return (
    <div className="group flex flex-col gap-2">
      <Label htmlFor={inputId} className="gap-0.5">
        Company
        <span aria-hidden className="text-red-600">
          *
        </span>
      </Label>
      <Combobox.Root
        items={results}
        // Filtered on the server.
        filter={null}
        value={value}
        onValueChange={onValueChange}
        inputValue={search}
        onInputValueChange={setSearch}
        itemToStringLabel={(company: DirectoryCompany) => company.name}
        isItemEqualToValue={(a: DirectoryCompany, b: DirectoryCompany) => a._id === b._id}
      >
        <div
          ref={anchorRef}
          className={cn(fieldBox, fieldBoxState(!!error), "items-center gap-2 p-3")}
        >
          <RiSearchLine {...iconProps} className="shrink-0 text-gray-950" />
          <Combobox.Input
            id={inputId}
            placeholder="Search companies"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? messageId : undefined}
            className="w-full min-w-0 bg-transparent text-body font-normal text-gray-950 outline-none placeholder:text-gray-400"
          />
        </div>
        <ComboboxContent anchor={anchorRef}>
          <ComboboxEmpty>No companies match that name.</ComboboxEmpty>
          <ComboboxList>
            {(company: DirectoryCompany) => (
              <ComboboxItem key={company._id} value={company}>
                {company.name}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox.Root>
      {error && (
        <p id={messageId} role="alert" className="text-body-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
