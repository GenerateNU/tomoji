"use client";

import { useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import { ChartTooltip, ChartTooltipRow } from "./chart-tooltip";
import { heatStep } from "./paths";

// Step 0 is empty; 1–3 are blue at 15, 35 and 60%; 4 is full blue.
const STEP_CLASS = ["bg-gray-50", "bg-primary/15", "bg-primary/35", "bg-primary/60", "bg-primary"];

type HeatmapProps = {
  /** Row labels, e.g. days of the week. */
  rows: string[];
  /** Column names for the tooltip, e.g. "7 PM"; one per column. */
  columns: string[];
  /** The few column labels shown under the grid, by column index. */
  columnTicks: { index: number; label: string }[];
  /** values[row][column]. */
  values: number[][];
  /** What the values count, e.g. "Engagements". */
  valueLabel: string;
  formatValue: (value: number) => string;
  title: string;
  className?: string;
};

/**
 * Figma "Heatmap": a grid of cells on one blue scale, darker meaning more, with
 * a Less → More key. Hovering a cell, or moving with arrow keys once the grid
 * has focus, outlines it and shows its value.
 */
export function Heatmap({
  rows,
  columns,
  columnTicks,
  values,
  valueLabel,
  formatValue,
  title,
  className,
}: HeatmapProps) {
  const [active, setActive] = useState<{ row: number; column: number } | null>(null);
  const max = Math.max(...values.flat(), 0);

  const moveWithKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    setActive((current) => {
      const from = current ?? { row: 0, column: 0 };
      return {
        row: Math.min(rows.length - 1, Math.max(0, from.row + move[0])),
        column: Math.min(columns.length - 1, Math.max(0, from.column + move[1])),
      };
    });
  };

  const activeValue = active ? values[active.row][active.column] : null;
  const activeTitle = active ? `${rows[active.row]}, ${columns[active.column]}` : "";

  return (
    <figure
      className={cn(
        "flex w-fit flex-col gap-3 rounded-sm bg-card px-5 pt-5 pb-4 shadow-card",
        className,
      )}
    >
      <div className="flex gap-3">
        <div aria-hidden className="flex flex-col gap-0.5 text-right text-body-xs text-gray-400">
          {rows.map((row) => (
            <span key={row} className="h-4 leading-4">
              {row}
            </span>
          ))}
        </div>
        <div className="flex flex-col gap-3">
          <div
            role="img"
            aria-label={title}
            tabIndex={0}
            onKeyDown={moveWithKeys}
            onFocus={() => setActive((current) => current ?? { row: 0, column: 0 })}
            onBlur={() => setActive(null)}
            onPointerLeave={() => setActive(null)}
            className="relative grid w-fit gap-0.5 rounded-xs outline-none focus-visible:ring-4 focus-visible:ring-ring/25"
            style={{ gridTemplateColumns: `repeat(${columns.length}, 1rem)` }}
          >
            {values.map((row, rowIndex) =>
              row.map((value, columnIndex) => {
                const isActive = active?.row === rowIndex && active.column === columnIndex;
                return (
                  <span
                    key={`${rowIndex}-${columnIndex}`}
                    aria-hidden
                    onPointerEnter={() => setActive({ row: rowIndex, column: columnIndex })}
                    className={cn(
                      "relative size-4 rounded-xs",
                      STEP_CLASS[heatStep(value, max)],
                      isActive && "inset-ring-2 inset-ring-foreground",
                    )}
                  >
                    {isActive && (
                      <ChartTooltip
                        title={activeTitle}
                        className="absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2"
                      >
                        <ChartTooltipRow value={formatValue(value)} label={valueLabel} />
                      </ChartTooltip>
                    )}
                  </span>
                );
              }),
            )}
          </div>
          {/* Cells are 16px with a 2px gap, so column n starts at n × 18px. */}
          <div aria-hidden className="relative h-4 text-body-xs text-gray-400">
            {columnTicks.map((tick) => (
              <span
                key={tick.label}
                className="absolute"
                style={{ left: `${tick.index * 1.125}rem` }}
              >
                {tick.label}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div aria-hidden className="flex items-center justify-end gap-1 text-body-xs text-gray-400">
        Less
        {STEP_CLASS.map((step) => (
          <span key={step} className={cn("size-2.5 rounded-xs", step)} />
        ))}
        More
      </div>
      <p className="sr-only" aria-live="polite">
        {activeValue !== null && `${activeTitle}: ${formatValue(activeValue)} ${valueLabel}`}
      </p>
    </figure>
  );
}
