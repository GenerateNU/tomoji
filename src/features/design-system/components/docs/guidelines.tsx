import { RiCheckLine, RiCloseLine } from "@remixicon/react";
import type { ReactNode } from "react";
import { iconProps } from "@/lib/icons";

export type GuidelinesProps = {
  whenToUse?: ReactNode[];
  do?: ReactNode[];
  dont?: ReactNode[];
};

function GuidelineCard({ title, items }: { title: ReactNode; items: ReactNode[] }) {
  return (
    <div className="rounded-lg border border-gray-100 p-5">
      <p className="flex items-center gap-1.5 text-body-sm font-medium">{title}</p>
      <ul className="mt-3 space-y-2 text-body-sm leading-[1.5] text-gray-600">
        {items.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

export function Guidelines({ whenToUse, do: doItems, dont }: GuidelinesProps) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {whenToUse?.length ? <GuidelineCard title="When to use" items={whenToUse} /> : null}
      {doItems?.length ? (
        <GuidelineCard
          title={
            <>
              <RiCheckLine {...iconProps} className="text-blue-primary" /> Do
            </>
          }
          items={doItems}
        />
      ) : null}
      {dont?.length ? (
        <GuidelineCard
          title={
            <>
              <RiCloseLine {...iconProps} className="text-red-600" /> Don’t
            </>
          }
          items={dont}
        />
      ) : null}
    </div>
  );
}
