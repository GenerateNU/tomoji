"use client";

import { BarList } from "@/components/charts/bar-list";
import { Example } from "@/features/design-system/components/docs/example";

const compact = (value: number) =>
  new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);

const posts = [
  { label: "Morning routine with Opus", value: 48200 },
  { label: "Unboxing the new kit", value: 36900 },
  { label: "3 tips for faster edits", value: 29400 },
  { label: "Day in the life: studio", value: 21800 },
  { label: "Behind the scenes", value: 15200 },
  { label: "Q&A: your questions", value: 9100 },
];

const creators = [
  { label: "Maya R.", value: 24100 },
  { label: "Jordan K.", value: 21300 },
  { label: "You", value: 18400 },
  { label: "Sam T.", value: 12900 },
  { label: "Priya N.", value: 8700 },
];

export function BarListExamples() {
  return (
    <>
      <Example
        title="Top posts"
        description="Ranked largest first, value at each tip. Hover or tab to a row for its share of the total."
        code={`<BarList
  items={[
    { label: "Morning routine with Opus", value: 48200 },
    { label: "Unboxing the new kit", value: 36900 },
    …
  ]}
  seriesLabel="Views"
  format={compact}            // 48.2K
  aria-label="Views by post, last 30 days"
/>`}
      >
        <BarList
          items={posts}
          seriesLabel="Views"
          format={compact}
          aria-label="Views by post, last 30 days"
          className="w-full max-w-[560px]"
        />
      </Example>
      <Example
        title="Highlight one row"
        description="When one row is the story, highlight it: it stays blue and the rest turn gray."
        code={`<BarList items={creators} highlight="You" seriesLabel="Avg. views per post" format={compact} />`}
      >
        <BarList
          items={creators}
          highlight="You"
          seriesLabel="Avg. views per post"
          format={compact}
          aria-label="Average views per post, you vs. other creators in this campaign"
          className="w-full max-w-[560px]"
        />
      </Example>
    </>
  );
}
