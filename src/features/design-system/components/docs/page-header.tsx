import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHeader({
  eyebrow,
  title,
  summary,
  children,
}: {
  eyebrow: string;
  title: string;
  summary: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="max-w-3xl">
      <p className="text-body-xs font-medium tracking-[0.04em] text-gray-500 uppercase">
        {eyebrow}
      </p>
      <h1 className="mt-2 text-heading-xxl tracking-[-0.01em] text-gray-950">{title}</h1>
      <p className={cn("mt-3 text-body-lg font-normal leading-[1.5] text-gray-500")}>{summary}</p>
      {children ? <div className="mt-5 flex flex-wrap gap-2">{children}</div> : null}
    </header>
  );
}
