"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { RiArrowLeftSLine, RiArrowRightSLine } from "@remixicon/react";
import { usePaginatedQuery } from "convex/react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { iconProps } from "@/lib/icons";
import { NoOpportunities } from "./no-opportunities";
import { OpportunityCard } from "./opportunity-card";
import { OpportunityModal } from "./opportunity-modal";

// Discovery lists the creator's best matches first, so its first page is the row.
// Briefs they've already applied to or claimed are left out: the row is for new ones.
const ROW_SIZE = 8;
// Three cards fill the row, as in the design; below 300px each, the row scrolls instead.
const CARD_WIDTH = "w-[calc((100%-2rem)/3)] min-w-[300px] shrink-0";

/** A scrolling row of the creator's best-matched open opportunities, for the home page. */
export function RecommendedOpportunities() {
  const { results, status, loadMore } = usePaginatedQuery(
    api.opportunities.discover,
    { actedOn: false },
    { initialNumItems: ROW_SIZE },
  );
  const opportunities = results.slice(0, ROW_SIZE);
  // Discovery caps the rows a page may read, so a page can come back short, or
  // empty, while more remain (hidden matches are skipped, not counted). Keep
  // asking until the row is full or the feed runs out, and only call the feed
  // empty once it has.
  useEffect(() => {
    if (status === "CanLoadMore" && results.length < ROW_SIZE) {
      loadMore(ROW_SIZE - results.length);
    }
  }, [status, results.length, loadMore]);
  const loading = opportunities.length === 0 && status !== "Exhausted";
  const [selectedId, setSelectedId] = useState<Id<"opportunities"> | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const row = useRef<HTMLUListElement>(null);
  const [canScroll, setCanScroll] = useState({ back: false, forward: false });
  const measure = useCallback(() => {
    const element = row.current;
    if (element === null) return;
    setCanScroll({
      back: element.scrollLeft > 1,
      forward: element.scrollLeft + element.clientWidth < element.scrollWidth - 1,
    });
  }, []);
  useEffect(() => {
    const element = row.current;
    if (element === null) return;
    // Watch the row itself, not the window: collapsing the sidebar changes the
    // row's width without a window resize. The observer also fires once on start.
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [measure, opportunities.length]);

  function scrollBy(direction: 1 | -1) {
    const element = row.current;
    if (element === null) return;
    const card = element.querySelector("li");
    const step = card ? card.getBoundingClientRect().width + 16 : element.clientWidth;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    element.scrollBy({ left: direction * step, behavior: reduceMotion ? "auto" : "smooth" });
  }

  return (
    <section
      aria-labelledby="recommended-heading"
      className="flex min-w-0 flex-col gap-4 rounded-lg bg-gray-0 p-6 shadow-card"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 id="recommended-heading" className="text-body-lg font-medium text-gray-950">
            Opportunities for you
          </h2>
          <p className="text-body-sm text-gray-500">New opportunities we think you&apos;d like</p>
        </div>
        {opportunities.length > 1 && (
          <div className="flex gap-1">
            <Button
              variant="secondary-ghost"
              size="icon-sm"
              className="disabled:cursor-default"
              aria-label="Previous opportunities"
              disabled={!canScroll.back}
              onClick={() => scrollBy(-1)}
            >
              <RiArrowLeftSLine {...iconProps} />
            </Button>
            <Button
              variant="secondary-ghost"
              size="icon-sm"
              className="disabled:cursor-default"
              aria-label="Next opportunities"
              disabled={!canScroll.forward}
              onClick={() => scrollBy(1)}
            >
              <RiArrowRightSLine {...iconProps} />
            </Button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex gap-4 overflow-hidden" aria-hidden>
          {[0, 1, 2].map((key) => (
            <Skeleton key={key} className={`h-[378px] rounded-lg ${CARD_WIDTH}`} />
          ))}
        </div>
      ) : opportunities.length === 0 ? (
        <NoOpportunities />
      ) : (
        <ul
          ref={row}
          onScroll={measure}
          aria-label="Recommended opportunities"
          // The arrows, trackpad, and touch still scroll it; only the bar is hidden.
          className="-m-4 flex snap-x snap-mandatory scroll-p-4 gap-4 overflow-x-auto p-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {opportunities.map((opportunity) => (
            <li key={opportunity._id} className={`flex snap-start *:w-full ${CARD_WIDTH}`}>
              <OpportunityCard
                opportunity={opportunity}
                onOpen={(opportunityId) => {
                  setSelectedId(opportunityId);
                  setModalOpen(true);
                }}
              />
            </li>
          ))}
        </ul>
      )}
      {loading && (
        <span className="sr-only" role="status">
          Loading opportunities…
        </span>
      )}

      <Link
        href="/opportunities"
        className={buttonVariants({ variant: "primary-subtle", className: "self-start" })}
      >
        Browse new opportunities
      </Link>

      {selectedId !== null && (
        <OpportunityModal opportunityId={selectedId} open={modalOpen} onOpenChange={setModalOpen} />
      )}
    </section>
  );
}
