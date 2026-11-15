"use client";

import { useState } from "react";
import { SelectableCard } from "@/components/selectable-card";
import { Example } from "@/features/design-system/components/docs/example";

const reasons = [
  {
    id: "opening",
    title: "Opening is too slow",
    description: "First 10 seconds need to hook faster",
  },
  {
    id: "product",
    title: "Product isn’t shown clearly",
    description: "Feature the cup in at least 3 shots",
  },
  {
    id: "cta",
    title: "Missing call to action",
    description: "Mention the discount code before the end",
  },
  {
    id: "audio",
    title: "Audio is hard to hear",
    description: "Reduce background music under voiceover",
  },
];

export function SelectableCardExamples() {
  const [picked, setPicked] = useState(["opening", "cta"]);

  return (
    <>
      <Example
        title="Request changes"
        description="Cards stacked 8px apart on a gray-25 panel. Hover an unchecked card to preview the check."
        code={`const [picked, setPicked] = useState(["opening", "cta"]);

<div className="flex flex-col gap-2">
  {reasons.map((r) => (
    <SelectableCard
      key={r.id}
      title={r.title}
      description={r.description}
      checked={picked.includes(r.id)}
      onCheckedChange={(on) => setPicked(on ? [...picked, r.id] : picked.filter((p) => p !== r.id))}
    />
  ))}
</div>`}
      >
        <div className="flex w-full max-w-md flex-col gap-3 rounded-lg bg-gray-25 p-4">
          <p className="text-body font-medium text-gray-950">What needs to change?</p>
          <div className="flex flex-col gap-2">
            {reasons.map((reason) => (
              <SelectableCard
                key={reason.id}
                title={reason.title}
                description={reason.description}
                checked={picked.includes(reason.id)}
                onCheckedChange={(on) =>
                  setPicked(on ? [...picked, reason.id] : picked.filter((id) => id !== reason.id))
                }
              />
            ))}
          </div>
        </div>
      </Example>
      <Example
        title="Disabled"
        code={`<SelectableCard
  disabled
  title="Opening is too slow"
  description="First 10 seconds need to hook faster"
/>`}
      >
        <div className="w-full max-w-md">
          <SelectableCard
            disabled
            title="Opening is too slow"
            description="First 10 seconds need to hook faster"
          />
        </div>
      </Example>
    </>
  );
}
