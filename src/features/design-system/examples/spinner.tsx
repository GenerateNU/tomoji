"use client";

import { Spinner } from "@/components/spinner";
import { Example } from "@/features/design-system/components/docs/example";

const SIZES = [16, 20, 24, 32, 40, 48] as const;

export function SpinnerExamples() {
  return (
    <>
      <Example
        title="Default"
        description="The brackets turn around the o, a half turn at a time."
        code="<Spinner size={48} />"
      >
        <Spinner size={48} />
      </Example>
      <Example
        title="Sizes"
        description="size is the height of the mark, from 16 to 48px."
        code={SIZES.map((size) => `<Spinner size={${size}} />`).join("\n")}
      >
        {SIZES.map((size) => (
          <Spinner key={size} size={size} />
        ))}
      </Example>
      <Example
        title="Inline"
        description="Beside a short label for small waits."
        code={`<div className="flex items-center gap-2">
  <Spinner size={16} label="Checking availability" />
  <span>Checking availability…</span>
</div>`}
      >
        <div className="flex items-center gap-2 text-body-sm text-gray-500">
          <Spinner size={16} label="Checking availability" />
          <span>Checking availability…</span>
        </div>
      </Example>
    </>
  );
}
