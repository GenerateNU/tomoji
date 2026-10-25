import { Skeleton } from "@/components/ui/skeleton";
export function SettingsSkeleton() {
  return (
    <div role="status" className="space-y-6">
      <span className="sr-only">Loading settings…</span>
      {[0, 1, 2].map((section) => (
        <div key={section} aria-hidden className="space-y-6 rounded-2xl bg-card p-6 sm:p-8">
          <Skeleton className="h-6 w-36 rounded" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
      ))}
    </div>
  );
}
