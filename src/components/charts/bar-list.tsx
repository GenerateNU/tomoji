"use client";

import { useState, type ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { ChartTooltip, defaultFormat } from "./chart-tooltip";

type BarListProps = Omit<ComponentProps<"figure">, "children"> & {
  /** Rows top to bottom, largest first. */
  items: { label: string; value: number }[];
  /** Label of the emphasized row; the others turn gray. */
  highlight?: string;
  /** Domain top. Defaults to the largest value. */
  max?: number;
  /** Measure name in the tooltip and table. */
  seriesLabel?: string;
  /** Formats values at the tips, in the tooltip and table. */
  format?: (value: number) => string;
};

/**
 * Figma "Bar List": ranked horizontal bars in a card, each with its value at
 * the tip. Hovering or focusing a row shows its share of the total and dims
 * the other bars.
 */
export function BarList({
  items,
  highlight,
  max,
  seriesLabel = "Value",
  format = defaultFormat,
  className,
  "aria-label": ariaLabel,
  ...props
}: BarListProps) {
  const [active, setActive] = useState<number | null>(null);
  const top = max ?? Math.max(...items.map((item) => item.value), 1);
  const total = items.reduce((sum, item) => sum + item.value, 0) || 1;

  return (
    <figure
      aria-label={ariaLabel}
      className={cn("rounded bg-gray-0 px-5 py-4 shadow-tile", className)}
      {...props}
    >
      <ul className="flex flex-col" onPointerLeave={() => setActive(null)}>
        {items.map((item, index) => {
          const percent = (item.value / top) * 100;
          const emphasized = highlight === undefined || highlight === item.label;
          return (
            <li
              key={item.label}
              tabIndex={0}
              aria-label={`${item.label}: ${format(item.value)}`}
              onPointerEnter={() => setActive(index)}
              onFocus={() => setActive(index)}
              onBlur={() => setActive(null)}
              className="relative grid cursor-default grid-cols-[9rem_1fr] items-center gap-3 rounded-xs py-1.5 outline-none focus-visible:ring-4 focus-visible:ring-blue-primary/25"
            >
              <span
                className={cn(
                  "truncate text-body-sm",
                  highlight === item.label
                    ? "font-medium text-gray-950"
                    : "font-normal text-gray-700",
                )}
              >
                {item.label}
              </span>
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className={cn(
                    "h-5 shrink-0 rounded-r transition-opacity",
                    emphasized ? "bg-blue-primary" : "bg-gray-50",
                    active !== null && active !== index && "opacity-60",
                  )}
                  style={{ width: `calc(${percent}% - ${(percent / 100) * 64}px)` }}
                />
                <span className="shrink-0 text-body-sm font-medium text-gray-950 tabular-nums">
                  {format(item.value)}
                </span>
              </span>
              {active === index && (
                <ChartTooltip
                  title={item.label}
                  rows={[
                    { label: seriesLabel, value: format(item.value) },
                    { label: "of total", value: `${Math.round((item.value / total) * 100)}%` },
                  ]}
                  left={`calc(9rem + 12px + (100% - 9rem - 12px - 64px) * ${percent / 100})`}
                  top="6px"
                />
              )}
            </li>
          );
        })}
      </ul>
      <table className="sr-only">
        <caption>{ariaLabel}</caption>
        <thead>
          <tr>
            <th scope="col">Item</th>
            <th scope="col">{seriesLabel}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.label}>
              <th scope="row">{item.label}</th>
              <td>{format(item.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
