"use client";

import { Heatmap } from "@/components/charts/heatmap";
import { Example } from "@/features/design-system/components/docs/example";

const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const dayWeight = [0.8, 0.85, 0.9, 0.95, 1, 1.15, 1.1];
const hourName = (hour: number) => `${hour % 12 || 12} ${hour < 12 ? "AM" : "PM"}`;
const hourNames = Array.from({ length: 24 }, (_, hour) => hourName(hour));
const hourLabels = hourNames.map((name, hour) =>
  hour % 6 === 0 ? name.replace(" ", "").toLowerCase().replace("m", "") : "",
);
const activity = days.map((_, day) =>
  Array.from({ length: 24 }, (_, hour) =>
    Math.round(
      1200 *
        (0.9 * Math.exp(-((hour - 19) ** 2) / 18) +
          0.4 * Math.exp(-((hour - 12) ** 2) / 10) +
          0.04) *
        dayWeight[day] +
        ((7 * hour + 13 * day) % 11) * 6,
    ),
  ),
);

export function HeatmapExamples() {
  return (
    <Example
      title="When your audience is active"
      description="Day by hour, darker is busier. Hover a cell, or tab to the grid and use the arrow keys."
      code={`<Heatmap
  rows={["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]}
  columns={hourLabels}          // "12a", "", …, "6a", …
  columnNames={hourNames}       // "12 AM", "1 AM", …
  values={activity}             // 7 rows × 24 hours
  seriesLabel="Engagements"
  aria-label="Engagements by day and hour, last 30 days"
/>`}
    >
      <Heatmap
        rows={days}
        columns={hourLabels}
        columnNames={hourNames}
        values={activity}
        seriesLabel="Engagements"
        aria-label="Engagements by day and hour, last 30 days"
        className="w-full max-w-[640px]"
      />
    </Example>
  );
}
