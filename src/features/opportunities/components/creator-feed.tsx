"use client";

import type { Id } from "@convex/_generated/dataModel";
import {
  RiCheckboxCircleLine,
  RiEqualizer2Line,
  RiLayoutGridLine,
  RiListUnordered,
  RiSearchLine,
  RiListCheck2,
  RiStarLine,
} from "@remixicon/react";
import { useState } from "react";
import { FilterChip } from "@/components/filter-chip";
import { TextField } from "@/components/text-field";
import { Button } from "@/components/ui/button";
import { Segment, SegmentedControl } from "@/components/ui/segmented-control";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useOpportunityFeed } from "../hooks/use-opportunity-feed";
import { NO_FEED_FILTERS, type FeedFilters, type FeedView } from "../lib/types";
import { FeedSkeleton } from "./feed-skeleton";
import { FiltersDrawer } from "./filters-drawer";
import { NoOpportunities } from "./no-opportunities";
import { OpportunityModal } from "./opportunity-modal";
import { OpportunityCard } from "./opportunity-card";
import { OpportunityTable } from "./opportunity-table";

/** The creator's discovery feed: search, filters, grid or list view, and starring. */
export function CreatorFeed() {
  const [view, setView] = useState<FeedView>("grid");
  const [filters, setFilters] = useState<FeedFilters>(NO_FEED_FILTERS);
  // Kept after closing so the dialog keeps its content while it animates out.
  const [selectedId, setSelectedId] = useState<Id<"opportunities"> | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Read once per render so every row's "posted N days ago" agrees.
  const [now] = useState(() => Date.now());

  const search = useDebouncedValue(filters.search, 300);
  const feed = useOpportunityFeed({ ...filters, search });
  const loading = feed.status === "LoadingFirstPage";
  const filtered =
    JSON.stringify({ ...filters, starred: false }) !== JSON.stringify(NO_FEED_FILTERS);
  // Filters only the drawer shows, so the button can say some are on.
  const drawerCount =
    (filters.type === "all" ? 0 : 1) + filters.niches.length + filters.skills.length;

  function update(changes: Partial<FeedFilters>) {
    setFilters((current) => ({ ...current, ...changes }));
  }

  function openOpportunity(opportunityId: Id<"opportunities">) {
    setSelectedId(opportunityId);
    setModalOpen(true);
  }

  return (
    <div className="flex w-full flex-col gap-10 px-4 py-12 sm:px-10 lg:px-16 lg:py-16">
      <h1 className="text-heading-lg text-gray-950">Opportunities</h1>

      <section aria-label="Filters" className="flex flex-wrap items-end gap-3">
        <TextField
          label="Search"
          type="search"
          icon={RiSearchLine}
          placeholder="Search by keyword"
          value={filters.search}
          onChange={(event) => update({ search: event.target.value })}
          className="w-full max-w-[572px]"
        />
        <div className="flex flex-wrap items-center gap-2 pb-2.5">
          <FilterChip
            icon={RiCheckboxCircleLine}
            selected={filters.applied}
            onPressedChange={(applied) => update({ applied })}
          >
            Applied
          </FilterChip>
          <FilterChip
            icon={RiStarLine}
            selected={filters.starred}
            onPressedChange={(starred) => update({ starred })}
          >
            Starred
          </FilterChip>
          <FilterChip
            icon={RiListCheck2}
            selected={filters.eligible}
            onPressedChange={(eligible) => update({ eligible })}
          >
            Jobs I&apos;m eligible for
          </FilterChip>
          <Button
            variant={drawerCount > 0 ? "primary-subtle" : "secondary-subtle"}
            size="icon-sm"
            aria-label={drawerCount > 0 ? `More filters (${drawerCount} on)` : "More filters"}
            title="More filters"
            onClick={() => setDrawerOpen(true)}
          >
            <RiEqualizer2Line aria-hidden />
          </Button>
        </div>
      </section>

      <FiltersDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        filters={filters}
        onApply={setFilters}
      />

      <section aria-labelledby="results-heading" className="flex flex-col gap-6">
        <div className="flex items-center justify-between gap-4">
          <h2 id="results-heading" className="text-body-lg font-medium text-gray-950">
            {filters.starred ? "Starred opportunities" : "Opportunities"}
            {/* The total is only known once every page has loaded. */}
            {feed.status === "Exhausted" && (
              <span className="text-gray-500"> ({feed.results.length})</span>
            )}
          </h2>
          <SegmentedControl
            aria-label="View"
            value={view}
            onChange={(next) => setView(next as FeedView)}
          >
            <Segment value="grid" label="Grid view" icon={RiLayoutGridLine} />
            <Segment value="list" label="List view" icon={RiListUnordered} />
          </SegmentedControl>
        </div>

        {loading ? (
          <FeedSkeleton />
        ) : feed.results.length === 0 ? (
          <NoOpportunities
            starredOnly={filters.starred}
            filtered={filtered}
            onClear={() => setFilters(NO_FEED_FILTERS)}
          />
        ) : view === "grid" ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {feed.results.map((opportunity) => (
              <OpportunityCard
                key={opportunity._id}
                opportunity={opportunity}
                onOpen={openOpportunity}
              />
            ))}
          </div>
        ) : (
          <OpportunityTable opportunities={feed.results} now={now} onOpen={openOpportunity} />
        )}

        {(feed.status === "CanLoadMore" || feed.status === "LoadingMore") && (
          <Button
            variant="secondary-subtle"
            className="self-center"
            disabled={feed.status === "LoadingMore"}
            onClick={feed.loadMore}
          >
            {feed.status === "LoadingMore" ? "Loading…" : "Load more"}
          </Button>
        )}
      </section>

      {selectedId !== null && (
        <OpportunityModal opportunityId={selectedId} open={modalOpen} onOpenChange={setModalOpen} />
      )}
    </div>
  );
}
