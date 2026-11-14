"use client";

import { api } from "@convex/_generated/api";
import { RiCheckboxCircleLine, RiListCheck2, RiStarLine } from "@remixicon/react";
import { useQuery } from "convex/react";
import { useState } from "react";
import { FilterChip } from "@/components/filter-chip";
import { MultiSelectField } from "@/components/multi-select-field";
import { SelectField } from "@/components/select-field";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { NO_FEED_FILTERS, type FeedFilters, type FeedType } from "../lib/types";

const TYPE_OPTIONS = [
  { value: "all", label: "All types" },
  { value: "gated", label: "Application required" },
  { value: "open", label: "Spots open" },
];

/**
 * The full set of feed filters in a side panel. Changes stay in a draft until
 * "View results", so the feed doesn't reload on every pick.
 */
export function FiltersDrawer({
  open,
  onOpenChange,
  filters,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: FeedFilters;
  onApply: (filters: FeedFilters) => void;
}) {
  const niches = useQuery(api.niches.list, {});
  const skills = useQuery(api.skills.list, {});
  const [draft, setDraft] = useState(filters);

  function update(changes: Partial<FeedFilters>) {
    setDraft((current) => ({ ...current, ...changes }));
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        // Each opening starts from the filters in use, not a stale draft.
        if (next) setDraft(filters);
        onOpenChange(next);
      }}
    >
      <SheetContent title="Filters">
        <div className="flex flex-wrap gap-2">
          <FilterChip
            icon={RiCheckboxCircleLine}
            selected={draft.applied}
            onPressedChange={(applied) => update({ applied })}
          >
            Applied
          </FilterChip>
          <FilterChip
            icon={RiStarLine}
            selected={draft.starred}
            onPressedChange={(starred) => update({ starred })}
          >
            Starred
          </FilterChip>
          <FilterChip
            icon={RiListCheck2}
            selected={draft.eligible}
            onPressedChange={(eligible) => update({ eligible })}
          >
            Jobs I&apos;m eligible for
          </FilterChip>
        </div>
        <div className="flex flex-col gap-6">
          <SelectField
            label="Type"
            placeholder="Select type"
            options={TYPE_OPTIONS}
            value={draft.type === "all" ? null : draft.type}
            onValueChange={(type) => update({ type: (type ?? "all") as FeedType })}
          />
          <MultiSelectField
            label="Niches"
            placeholder="Select niches"
            searchPlaceholder="Search niches"
            options={(niches ?? []).map(({ name, label }) => ({ value: name, label }))}
            value={draft.niches}
            onValueChange={(selected) => update({ niches: selected })}
          />
          <MultiSelectField
            label="Skills"
            placeholder="Select skills"
            searchPlaceholder="Search skills"
            options={(skills ?? []).map(({ name, label }) => ({ value: name, label }))}
            value={draft.skills}
            onValueChange={(selected) => update({ skills: selected })}
          />
        </div>
        <div className="flex items-center gap-4">
          <Button
            onClick={() => {
              onApply(draft);
              onOpenChange(false);
            }}
          >
            View results
          </Button>
          <Button
            variant="secondary-ghost"
            onClick={() => setDraft({ ...NO_FEED_FILTERS, search: draft.search })}
          >
            Clear filters
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
