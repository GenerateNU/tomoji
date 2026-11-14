import { cn } from "@/lib/utils";

const SIZES = {
  xs: "size-5.5 rounded-xs text-body-xs",
  sm: "size-8 rounded-sm text-body-sm",
} as const;

/**
 * Placeholder company mark from the design: a gray square with the first
 * letter of the name, until companies have logos on the feed.
 */
export function CompanyAvatar({ name, size }: { name: string; size: keyof typeof SIZES }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center bg-gray-50 font-medium text-gray-700",
        SIZES[size],
      )}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}
