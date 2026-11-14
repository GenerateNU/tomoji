import { Skeleton } from "@/components/ui/skeleton"; /** Placeholder shown while the profile loads. */
export function ProfileSkeleton() {
  return (
    <div role="status" className="space-y-6">
      <span className="sr-only">Loading profile…</span>
      <div aria-hidden className="flex flex-wrap gap-6 rounded-2xl bg-card p-6 sm:p-8">
        <Skeleton className="size-28 rounded-full" />
        <div className="min-w-0 flex-1 space-y-3">
          <Skeleton className="h-7 w-48 max-w-full rounded" />
          <Skeleton className="h-5 w-28 max-w-full rounded" />
        </div>
      </div>
      <div aria-hidden className="space-y-4 rounded-2xl bg-card p-6 sm:p-8">
        <Skeleton className="h-6 w-36 rounded" />
        <Skeleton className="h-5 w-64 max-w-full rounded" />
      </div>
    </div>
  );
}
