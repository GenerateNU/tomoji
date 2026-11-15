"use client";

import { RiFunctionLine, RiListUnordered } from "@remixicon/react";
import { useState } from "react";
import { Segment, SegmentedControl } from "@/components/ui/segmented-control";
import { Example } from "@/features/design-system/components/docs/example";

export function SegmentedControlExamples() {
  const [status, setStatus] = useState("scheduled");
  const [view, setView] = useState("grid");

  return (
    <>
      <Example
        title="Status filter"
        code={`const [status, setStatus] = useState("scheduled");

<SegmentedControl value={status} onChange={setStatus} aria-label="Status">
  <Segment value="live" label="Live" />
  <Segment value="scheduled" label="Scheduled" />
  <Segment value="paused" label="Paused" />
</SegmentedControl>`}
      >
        <SegmentedControl value={status} onChange={setStatus} aria-label="Status">
          <Segment value="live" label="Live" />
          <Segment value="scheduled" label="Scheduled" />
          <Segment value="paused" label="Paused" />
        </SegmentedControl>
      </Example>
      <Example
        title="View toggle"
        description="Icon segments; label becomes the accessible name and tooltip."
        code={`<SegmentedControl value={view} onChange={setView} aria-label="View">
  <Segment value="grid" label="Grid view" icon={RiFunctionLine} />
  <Segment value="list" label="List view" icon={RiListUnordered} />
</SegmentedControl>`}
      >
        <SegmentedControl value={view} onChange={setView} aria-label="View">
          <Segment value="grid" label="Grid view" icon={RiFunctionLine} />
          <Segment value="list" label="List view" icon={RiListUnordered} />
        </SegmentedControl>
      </Example>
      <Example
        title="Date range (uncontrolled)"
        code={`<SegmentedControl defaultValue="week" aria-label="Range">
  <Segment value="week" label="Week" />
  <Segment value="month" label="Month" />
  <Segment value="quarter" label="Quarter" />
  <Segment value="year" label="Year" />
</SegmentedControl>`}
      >
        <SegmentedControl defaultValue="week" aria-label="Range">
          <Segment value="week" label="Week" />
          <Segment value="month" label="Month" />
          <Segment value="quarter" label="Quarter" />
          <Segment value="year" label="Year" />
        </SegmentedControl>
      </Example>
    </>
  );
}
