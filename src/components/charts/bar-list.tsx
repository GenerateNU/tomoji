import { cn } from "@/lib/utils";

type BarListProps = {
  /** Largest first. */
  items: { label: string; value: number }[];
  /** The label of the row the story is about; the others turn gray. */
  highlight?: string;
  formatValue: (value: number) => string;
  className?: string;
};

/**
 * Figma "Bar List": ranked horizontal bars in a card, each with its value at
 * the tip. Hovering a row also shows its share of the total.
 */
export function BarList({ items, highlight, formatValue, className }: BarListProps) {
  const max = Math.max(...items.map((item) => item.value), 1);
  const total = items.reduce((sum, item) => sum + item.value, 0);

  return (
    <ul className={cn("rounded-sm bg-card px-5 py-4 shadow-card", className)}>
      {items.map((item) => {
        const emphasis =
          highlight === undefined ? "default" : item.label === highlight ? "highlighted" : "muted";
        const share = total === 0 ? 0 : Math.round((item.value / total) * 100);
        return (
          <li
            key={item.label}
            data-emphasis={emphasis}
            className="group/bar-row flex h-8 items-center gap-3"
          >
            <span className="w-36 shrink-0 truncate text-body-sm text-gray-700 group-data-[emphasis=highlighted]/bar-row:font-medium group-data-[emphasis=highlighted]/bar-row:text-foreground">
              {item.label}
            </span>
            <span className="flex min-w-0 flex-1 items-center gap-2 pr-2">
              <span
                aria-hidden
                className="h-5 rounded-r-sm bg-primary group-data-[emphasis=muted]/bar-row:bg-gray-50"
                style={{ width: `calc(${(item.value / max) * 100}% - 4rem)` }}
              />
              <span className="shrink-0 text-body-sm font-medium whitespace-nowrap text-foreground">
                {formatValue(item.value)}
                <span className="font-normal text-muted-foreground opacity-0 transition-opacity group-hover/bar-row:opacity-100">
                  {" "}
                  · {share}%
                </span>
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
