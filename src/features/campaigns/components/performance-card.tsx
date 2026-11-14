"use client";

import type { ReactNode } from "react";
import { Chart } from "@/components/charts/line-chart";
import { formatMoney } from "@/lib/money";
import { formatCount, mockAnalytics } from "../lib/mock-analytics";

/**
 * A white card with a title, a status line, stats, and a views chart, shared
 * by campaign and opportunity cards. Numbers come from `mockAnalytics` until
 * the X metrics sync is queryable.
 */
export function PerformanceCard({
  id,
  title,
  subtitle,
  menu,
  onOpen,
}: {
  id: string;
  title: string;
  subtitle: string;
  menu?: ReactNode;
  onOpen?: () => void;
}) {
  const stats = mockAnalytics(id);
  return (
    <article className="relative flex flex-col gap-4 rounded-lg bg-gray-0 p-5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          {onOpen ? (
            <button
              type="button"
              onClick={onOpen}
              className="truncate text-left text-body-lg font-medium text-gray-950 after:absolute after:inset-0 hover:underline"
            >
              {title}
            </button>
          ) : (
            <h3 className="truncate text-body-lg font-medium text-gray-950">{title}</h3>
          )}
          <p className="text-body-sm text-gray-500">{subtitle}</p>
        </div>
        {/* Above the card's stretched link, so the menu stays clickable. */}
        {menu && <div className="relative z-10">{menu}</div>}
      </div>
      <p className="flex flex-wrap gap-x-4 text-body-sm text-gray-950">
        <span>{stats.creators} creators</span>
        <span>{stats.posts} posts</span>
        <span>{formatCount(stats.views)} views</span>
      </p>
      <Chart
        values={stats.weeklyViews}
        labels={stats.weekLabels.map((label, index, all) =>
          index === 0 || index === all.length - 1 ? label : "",
        )}
        seriesLabel="Views"
        format={formatCount}
        legend={
          <span className="flex gap-3 text-body-xs text-gray-500">
            <span>{formatCount(stats.views)} views</span>
            <span>{formatMoney(stats.spendCents)} spend</span>
          </span>
        }
        aria-label={`Weekly views for ${title}`}
        className="h-40"
      />
    </article>
  );
}
