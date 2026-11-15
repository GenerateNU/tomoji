"use client";

import { useState } from "react";
import { ProgressRing } from "@/components/progress-ring";
import { Example } from "@/features/design-system/components/docs/example";

const VALUES = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

export function ProgressRingExamples() {
  const [value, setValue] = useState(40);

  return (
    <>
      <Example
        title="Small"
        description="40px with a 3px ring."
        code={`<ProgressRing value={40} label="Profile completion" />`}
      >
        {VALUES.map((v) => (
          <ProgressRing key={v} value={v} label={`${v}% complete`} />
        ))}
      </Example>
      <Example
        title="Medium"
        description="56px with a 4px ring."
        code={`<ProgressRing value={40} size="md" label="Profile completion" />`}
      >
        {VALUES.map((v) => (
          <ProgressRing key={v} value={v} size="md" label={`${v}% complete`} />
        ))}
      </Example>
      <Example
        title="Profile completion"
        description="Any value works, not just steps of 10 — drag the slider."
        canvasClassName="flex-col"
        code={`<div className="flex items-center gap-4 rounded-lg bg-gray-0 p-4 shadow-card">
  <ProgressRing value={40} size="md" label="Profile completion" />
  <div className="flex flex-col gap-0.5">
    <p className="text-body font-medium text-gray-950">Complete your profile</p>
    <p className="text-body-sm text-gray-500">Add a bio and portfolio links to get more offers</p>
  </div>
</div>`}
      >
        <div className="flex w-[406px] max-w-full items-center gap-4 rounded-lg bg-gray-0 p-4 shadow-card">
          <ProgressRing value={value} size="md" label="Profile completion" />
          <div className="flex flex-col gap-0.5">
            <p className="text-body font-medium text-gray-950">Complete your profile</p>
            <p className="text-body-sm font-normal text-gray-500">
              Add a bio and portfolio links to get more offers
            </p>
          </div>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={value}
          onChange={(event) => setValue(Number(event.target.value))}
          aria-label="Value"
          className="w-[406px] max-w-full accent-blue-primary"
        />
      </Example>
    </>
  );
}
