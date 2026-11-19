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
const ROW_SIZE = 8;

/** A scrolling row of the creator's best-matched open opportunities, for the home page. */
export function RecommendedOpportunities() {
  const feed = usePaginatedQuery(api.opportunities.discover, {}, { initialNumItems: ROW_SIZE });
  const opportunities = feed.results.slice(0, ROW_SIZE);
  const loading = feed.status === "LoadingFirstPage";
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
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
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
            <Skeleton key={key} className="h-[22rem] w-72 shrink-0 rounded-lg" />
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
            <li key={opportunity._id} className="flex w-72 shrink-0 snap-start *:w-full">
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
