import { Skeleton } from "@/components/ui/skeleton";
export function SettingsSkeleton() {
  return (
    <div role="status" className="space-y-8 sm:space-y-11">
      <span className="sr-only">Loading settings…</span>
      <div aria-hidden className="flex gap-6 border-b pb-4">
        <Skeleton className="h-5 w-16 rounded" />
        <Skeleton className="h-5 w-16 rounded" />
      </div>
      <div
        aria-hidden
        className="flex max-w-[34rem] flex-wrap items-center justify-between gap-5 rounded-lg bg-card p-5 shadow-card"
      >
        <div className="space-y-3">
          <Skeleton className="h-5 w-48 rounded" />
          <Skeleton className="h-4 w-56 max-w-full rounded" />
        </div>
        <Skeleton className="h-11 w-36 rounded-sm" />
      </div>
    </div>
  );
}
