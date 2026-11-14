"use client";

import { RiPlayCircleLine } from "@remixicon/react";
import { useState } from "react";
import { SelectField } from "@/components/select-field";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import {
  RANGE_CAPTIONS,
  RANGE_OPTIONS,
  formatPercent,
  percentChange,
  type EarningsRange,
} from "../lib/earnings-range";
import { useCachedSummary } from "../hooks/use-cached-summary";

/** The posts that earned the most in a range, with their change from the previous one. */
export function TopEarningPosts() {
  const [range, setRange] = useState<EarningsRange>("month");
  // Fixed when the page opens so the query's arguments stay the same between renders.
  const [now] = useState(() => new Date());
  const { summary, isStale } = useCachedSummary(range, now);

  return (
    <section aria-labelledby="top-earning-posts" className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 id="top-earning-posts" className="text-body-lg font-medium text-gray-950">
          Top Earning Posts
        </h2>
        <SelectField
          // The design has no visible label; screen readers still need one.
          label={<span className="sr-only">Top posts range</span>}
          options={RANGE_OPTIONS}
          value={range}
          onValueChange={(next) => next && setRange(next as EarningsRange)}
          className="w-50 gap-0"
        />
      </div>

      {summary === undefined ? (
        <ul aria-busy className="grid grid-cols-2 gap-7.5 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }, (_, i) => (
            <li key={i}>
              <Skeleton className="aspect-[171/137] w-full rounded-sm" />
            </li>
          ))}
        </ul>
      ) : summary.topPosts.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <div aria-hidden className="size-32 rounded-full bg-gray-50" />
          <p className="text-body font-medium text-gray-700">Nothing posted yet!</p>
          <p className="text-body-xs text-gray-500">
            {range === "all"
              ? "Post videos to start earning"
              : `No posts earned anything ${RANGE_CAPTIONS[range]}.`}
          </p>
        </div>
      ) : (
        <ul
          className={cn(
            "grid grid-cols-2 gap-7.5 sm:grid-cols-3 lg:grid-cols-6",
            isStale && "opacity-60 transition-opacity",
          )}
        >
          {summary.topPosts.map((post) => (
            <li key={post.postId}>
              <PostTile
                amount={post.amount}
                change={percentChange(post.amount, post.previousAmount)}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// Not a link yet: posts will open their own page once the Posts page exists.
function PostTile({ amount, change }: { amount: number; change: number | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="flex aspect-[171/137] w-full items-center justify-center rounded-sm bg-gray-200 text-gray-950">
        <RiPlayCircleLine aria-hidden size={16} />
      </span>
      <p className="flex items-center gap-2">
        <span className="text-body font-medium text-gray-950">{formatMoney(amount)}</span>
        {change !== null && (
          // Darker than the design's green, which is too faint for small text.
          <span className={cn("text-body-xs", change >= 0 ? "text-green-700" : "text-red-600")}>
            <span aria-hidden>{change >= 0 ? "▲" : "▼"}</span>
            <span className="sr-only">{change >= 0 ? "up" : "down"}</span> {formatPercent(change)}
          </span>
        )}
      </p>
    </div>
  );
}
