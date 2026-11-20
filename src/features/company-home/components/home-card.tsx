import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { homeMoney } from "../lib/home";

/** Renders currency totals separately, with a real zero for an empty total. */
export function MoneyAmounts({ amounts }: { amounts: { amount: number; currency: string }[] }) {
  return (
    <>
      {amounts.length
        ? amounts.map((a) => (
            <span key={a.currency} className="block">
              {homeMoney(a.amount, a.currency)}
            </span>
          ))
        : "$0"}
    </>
  );
}

/** The shared 500px To-Do card from company Home, with natural height on mobile. */
export function HomeCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section
      aria-label={title}
      className="flex min-w-0 flex-col items-start gap-5 rounded-lg bg-gray-0 p-6 shadow-page xl:min-h-125"
    >
      <h3 className="text-xl leading-[27px] font-medium text-gray-950">{title}</h3>
      {children}
    </section>
  );
}

/** The title and explanation used by each Figma empty card. */
export function EmptyTask({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-body font-medium">{title}</p>
      <p className="text-body-sm text-gray-500">{children}</p>
    </div>
  );
}

/** Preserves the dashboard grid while the first company-scoped reads load. */
export function HomeSkeleton() {
  return (
    <div role="status" aria-label="Loading company dashboard" className="space-y-10">
      <Skeleton className="h-18 w-full max-w-lg" />
      <div className="grid gap-5 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-46.5 w-full rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-8 w-24" />
      <div className="grid gap-5 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-80 w-full rounded-lg xl:h-125" />
        ))}
      </div>
    </div>
  );
}
