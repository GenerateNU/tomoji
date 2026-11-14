import { Skeleton } from "@/components/ui/skeleton";
export function SkeletonRow() {
  return (
    <tr aria-hidden>
      <td className="py-2.5 pr-5">
        <div className="flex items-center gap-4">
          <Skeleton className="size-13 shrink-0 rounded-2xl" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-5 w-40 rounded" />
            <Skeleton className="h-4 w-24 rounded" />
          </div>
        </div>
      </td>
      {Array.from({ length: 4 }, (_, i) => (
        <td key={i} className="py-2.5 pr-5 last:pr-0">
          <Skeleton className="h-5 w-20 rounded" />
        </td>
      ))}
    </tr>
  );
}
