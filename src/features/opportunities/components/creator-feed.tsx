"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ApplicationModal } from "@/features/applications/components/application-modal";
import { useOpportunityFeed } from "../hooks/use-opportunity-feed";
import type { FeedView } from "../lib/types";
import { FilterSelect } from "./filter-select";
import { OpportunityCard } from "./opportunity-card";
import { OpportunityTable } from "./opportunity-table";
import { FeedSkeleton } from "./feed-skeleton";
import { NoOpportunities } from "./no-opportunities";

type TypeFilter = "all" | "gated" | "open";

const TYPE_OPTIONS = [
  { value: "all", label: "All types" },
  { value: "gated", label: "Application required" },
  { value: "open", label: "Open spots" },
];

/** The creator's "For You" discovery feed: filters, grid or list view, and starring. */
export function CreatorFeed() {
  const [view, setView] = useState<FeedView>("grid");
  const [type, setType] = useState<TypeFilter>("all");
  const [niche, setNiche] = useState("");
  const [starredOnly, setStarredOnly] = useState(false);
  // Kept after closing so the dialog keeps its content while it animates out.
  const [selectedId, setSelectedId] = useState<Id<"opportunities"> | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  // Read once per render so every row's "posted N days ago" agrees.
  const [now] = useState(() => Date.now());

  const niches = useQuery(api.niches.list, {});
  const feed = useOpportunityFeed({ niche: niche || undefined, starredOnly });

  // The starred list isn't filtered by niche on the server, and type is a
  // flag on each item, so both narrow the loaded page here.
  const shown = feed.results.filter(
    (opportunity) =>
      (type === "all" || opportunity.isGated === (type === "gated")) &&
      (!starredOnly || niche === "" || opportunity.niches.includes(niche)),
  );
  const loading = feed.status === "LoadingFirstPage";

  function openOpportunity(opportunityId: Id<"opportunities">) {
    setSelectedId(opportunityId);
    setModalOpen(true);
  }

  return (
    <div className="mx-auto flex w-full max-w-[1241px] flex-col gap-10 px-4 py-12 sm:px-10 lg:px-20 lg:py-[120px]">
      <h1 className="text-3xl font-semibold">Opportunities</h1>

      <section aria-label="Filters" className="flex flex-col gap-5">
        <div className="flex flex-wrap items-end gap-3">
          <FilterSelect
            label="Type"
            value={type}
            onChange={(value) => setType(value as TypeFilter)}
            options={TYPE_OPTIONS}
          />
          <FilterSelect
            label="Niches"
            value={niche}
            onChange={setNiche}
            options={[
              { value: "", label: "All niches" },
              ...(niches ?? []).map((entry) => ({ value: entry.name, label: entry.label })),
            ]}
          />
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            aria-pressed={starredOnly}
            onClick={() => setStarredOnly((on) => !on)}
            className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-pressed:border-foreground aria-pressed:bg-muted"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size design icon */}
            <img
              src={`/icons/opportunities/${starredOnly ? "star-fill" : "star-line"}.svg`}
              alt=""
              width={18}
              height={18}
            />
            Starred
          </button>
        </div>
      </section>

      <section aria-label="Results" className="flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">
            {starredOnly ? "Starred opportunities" : "Opportunities"}
          </h2>
          <div className="flex gap-1" role="group" aria-label="View">
            <button
              type="button"
              aria-pressed={view === "grid"}
              aria-label="Grid view"
              onClick={() => setView("grid")}
              className="rounded-2xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- design icon includes its own background */}
              <img
                src={
                  view === "grid"
                    ? "/icons/opportunities/view-grid-selected.svg"
                    : "/icons/opportunities/view-grid.svg"
                }
                alt=""
                width={50.75}
                height={42.75}
              />
            </button>
            <button
              type="button"
              aria-pressed={view === "list"}
              aria-label="List view"
              onClick={() => setView("list")}
              className="flex h-[42.75px] w-[50.75px] items-center justify-center rounded-2xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-pressed:bg-muted"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size design icon */}
              <img
                src={
                  view === "list"
                    ? "/icons/opportunities/view-list-selected.svg"
                    : "/icons/opportunities/view-list.svg"
                }
                alt=""
                width={25}
                height={25}
              />
            </button>
          </div>
        </div>

        {loading ? (
          <FeedSkeleton />
        ) : shown.length === 0 ? (
          <NoOpportunities starredOnly={starredOnly} filtered={type !== "all" || niche !== ""} />
        ) : view === "grid" ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {shown.map((opportunity) => (
              <OpportunityCard
                key={opportunity._id}
                opportunity={opportunity}
                onOpen={openOpportunity}
              />
            ))}
          </div>
        ) : (
          <OpportunityTable opportunities={shown} now={now} onOpen={openOpportunity} />
        )}

        {(feed.status === "CanLoadMore" || feed.status === "LoadingMore") && (
          <Button
            variant="secondary"
            className="self-center"
            disabled={feed.status === "LoadingMore"}
            onClick={feed.loadMore}
          >
            {feed.status === "LoadingMore" ? "Loading…" : "Load more"}
          </Button>
        )}
      </section>

      {selectedId !== null && (
        <ApplicationModal opportunityId={selectedId} open={modalOpen} onOpenChange={setModalOpen} />
      )}
    </div>
  );
}
