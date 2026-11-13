"use client";

import { useState, type ComponentProps, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import { ChartTooltip, defaultFormat, tooltipAlign } from "./chart-tooltip";
import { heatStep, positiveMax } from "./paths";

// Step 0 is empty; 1–3 are blue at 15, 35 and 60%; 4 is full blue.
const SCALE = [
  "bg-gray-50",
  "bg-blue-primary/15",
  "bg-blue-primary/35",
  "bg-blue-primary/60",
  "bg-blue-primary",
];

type HeatmapProps = Omit<ComponentProps<"figure">, "children"> & {
  /** Row labels top to bottom. */
  rows: string[];
  /** Column labels; "" leaves one blank. */
  columns: string[];
  /** values[row][column]. */
  values: number[][];
  /** Full column names for the tooltip and table. */
  columnNames?: string[];
  /** Measure name in the tooltip and table. */
  seriesLabel?: string;
  /** Formats values in the tooltip and table. */
  format?: (value: number) => string;
  /** Domain top. Defaults to the largest value. */
  max?: number;
};

const MOVES: Record<string, [number, number]> = {
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
};

/**
 * Figma "Heatmap": a grid of cells on one blue scale, darker meaning more, with
 * a Less → More key. Hovering a cell, or moving with the arrow keys once the
 * grid has focus, outlines it and shows its value.
 */
export function Heatmap({
  rows,
  columns,
  values,
  columnNames,
  seriesLabel = "Value",
  format = defaultFormat,
  max,
  className,
  "aria-label": ariaLabel,
  ...props
}: HeatmapProps) {
  const top = max ?? positiveMax(values.flat());
  const [active, setActive] = useState<[number, number] | null>(null);
  const cellAt = (row: number, column: number): number | undefined => values[row]?.[column];
  const isEmpty = rows.length === 0 || columns.length === 0 || values.length === 0;
  const columnName = (index: number) => columnNames?.[index] || columns[index] || `#${index + 1}`;
  const axisText = "text-body-xs font-normal text-gray-400";
  const template = {
    gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))`,
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (isEmpty) return;
    const move = MOVES[event.key];
    if (move) {
      setActive((current) => {
        const [row, column] = current ?? [0, 0];
        return [
          Math.min(Math.max(row + move[0], 0), Math.min(rows.length, values.length) - 1),
          Math.min(Math.max(column + move[1], 0), columns.length - 1),
        ];
      });
    } else if (event.key === "Escape") {
      setActive(null);
    } else {
      return;
    }
    event.preventDefault();
  };

  return (
    <figure
      aria-label={ariaLabel}
      className={cn("flex flex-col gap-3 rounded bg-gray-0 px-5 pt-5 pb-4 shadow-tile", className)}
      {...props}
    >
      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2">
        <div aria-hidden className={cn(axisText, "flex flex-col gap-0.5")}>
          {rows.map((row) => (
            <span key={row} className="flex flex-1 items-center justify-end">
              {row}
            </span>
          ))}
        </div>
        <div
          role="group"
          tabIndex={0}
          aria-label={`${ariaLabel ?? "Heatmap"}. Use the arrow keys to read values.`}
          onKeyDown={onKeyDown}
          onFocus={() => {
            if (!isEmpty) setActive((current) => current ?? [0, 0]);
          }}
          onBlur={() => setActive(null)}
          onPointerLeave={() => setActive(null)}
          className="relative grid gap-0.5 rounded-xs outline-none focus-visible:ring-4 focus-visible:ring-blue-primary/25"
          style={template}
        >
          {values.map((row, rowIndex) =>
            row.map((value, columnIndex) => (
              <span
                key={`${rowIndex}-${columnIndex}`}
                onPointerEnter={() => setActive([rowIndex, columnIndex])}
                className={cn(
                  "aspect-square rounded-xs outline-2 outline-offset-1 transition-[outline-color]",
                  SCALE[heatStep(value, top)],
                  active?.[0] === rowIndex && active[1] === columnIndex
                    ? "outline-gray-950"
                    : "outline-transparent",
                )}
              />
            )),
          )}
          {active && cellAt(active[0], active[1]) !== undefined && (
            <ChartTooltip
              title={`${rows[active[0]]}, ${columnName(active[1])}`}
              rows={[
                {
                  label: seriesLabel,
                  value: format(cellAt(active[0], active[1]) as number),
                },
              ]}
              left={`${((active[1] + 0.5) / columns.length) * 100}%`}
              top={`${(active[0] / rows.length) * 100}%`}
              align={tooltipAlign((active[1] + 0.5) / columns.length)}
            />
          )}
        </div>
        <span />
        <div aria-hidden className={cn(axisText, "grid gap-0.5")} style={template}>
          {columns.map((column, index) => (
            <span key={index} className="whitespace-nowrap">
              {column}
            </span>
          ))}
        </div>
      </div>
      <div className="flex justify-end">
        <div aria-hidden className={cn(axisText, "flex items-center gap-1")}>
          Less
          {SCALE.map((step) => (
            <span key={step} className={cn("size-2.5 rounded-xs", step)} />
          ))}
          More
        </div>
      </div>
      <table className="sr-only">
        <caption>{ariaLabel}</caption>
        <thead>
          <tr>
            <th scope="col" />
            {columns.map((_, index) => (
              <th key={index} scope="col">
                {columnName(index)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {values.map((row, rowIndex) => (
            <tr key={rowIndex}>
              <th scope="row">{rows[rowIndex]}</th>
              {row.map((value, columnIndex) => (
                <td key={columnIndex}>{format(value)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
