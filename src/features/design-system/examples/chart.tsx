"use client";

import { RiFileList3Line, RiMoneyDollarCircleLine, RiTimeLine } from "@remixicon/react";
import { useState } from "react";
import { Banner } from "@/components/banner";
import { LegendItem } from "@/components/charts/legend";
import { Chart } from "@/components/charts/line-chart";
import { StatTile } from "@/components/stat-tile";
import { Example } from "@/features/design-system/components/docs/example";
import { iconProps } from "@/lib/icons";

const dateLabel = (date: Date) =>
  date.toLocaleDateString("en-US", { month: "short", day: "numeric" });

const earnings = Array.from({ length: 61 }, (_, i) =>
  Math.round(100 + 500 / (1 + Math.exp(-(i - 30) / 6))),
);
const earningsLabels = earnings.map((_, i) =>
  i === 0 ? "9/12" : i === 40 ? "Today" : i === 60 ? "11/12" : "",
);
const earningsDates = earnings.map((_, i) => dateLabel(new Date(2026, 8, 12 + i)));
const days = Array.from({ length: 14 }, (_, i) => dateLabel(new Date(2026, 9, 5 + i)));
const campaignViews = [
  1200, 1850, 2400, 3900, 5200, 4800, 6100, 7400, 6900, 8200, 9100, 8600, 9800, 10400,
];
const averageViews = [
  2100, 2300, 2200, 2600, 2900, 3100, 2800, 3000, 3300, 3200, 3500, 3400, 3600, 3700,
];

const money = (value: number) => `$${value.toLocaleString("en-US")}`;

const earningsChart = (
  <Chart
    values={earnings}
    todayIndex={40}
    labels={earningsLabels}
    yLabels={["$600", "$300", "$100"]}
    min={100}
    max={600}
    seriesLabel="Earnings"
    pointLabels={earningsDates}
    format={money}
    legend={
      <>
        <LegendItem>Earnings</LegendItem>
        <LegendItem variant="dashed">Projected</LegendItem>
      </>
    }
    aria-label="Earnings from 9/12 to today, projected to 11/12"
  />
);

function EarningsDashboard() {
  const [open, setOpen] = useState(true);

  return (
    <div className="flex w-full max-w-[800px] flex-col gap-4 bg-gray-0 p-6">
      {open && (
        <Banner onClose={() => setOpen(false)}>
          Way to go! You’re making more than you made last month.
        </Banner>
      )}
      <div className="grid grid-cols-3 gap-4">
        <StatTile
          icon={<RiMoneyDollarCircleLine {...iconProps} />}
          label="Earned this month"
          value="$612"
          trend={{ text: "+24%", direction: "up" }}
        />
        <StatTile icon={<RiFileList3Line {...iconProps} />} label="Active assignments" value="3" />
        <StatTile
          icon={<RiTimeLine {...iconProps} />}
          label="Avg. approval time"
          value="1.4 days"
          trend={{ text: "-0.3d", direction: "down", tone: "primary" }}
        />
      </div>
      {earningsChart}
    </div>
  );
}

export function ChartExamples() {
  return (
    <>
      <Example
        title="Legend items"
        code={`<LegendItem>Earnings</LegendItem>
<LegendItem variant="dashed">Earnings</LegendItem>`}
      >
        <LegendItem>Earnings</LegendItem>
        <LegendItem variant="dashed">Earnings</LegendItem>
      </Example>
      <Example
        title="Line"
        description="Pass the whole series and todayIndex; points after it draw as the dashed projection. Hover, or tab to the plot and use the arrow keys, to read any day."
        code={`<Chart
  values={earnings}          // 61 daily values
  todayIndex={40}
  labels={labels}            // "9/12", "Today", "11/12", "" elsewhere
  yLabels={["$600", "$300", "$100"]}
  min={100}
  max={600}
  seriesLabel="Earnings"
  pointLabels={dates}        // "Sep 12", "Sep 13", … for the tooltip
  format={(v) => "$" + v}
  legend={<><LegendItem>Earnings</LegendItem><LegendItem variant="dashed">Projected</LegendItem></>}
  aria-label="Earnings from 9/12 to today, projected to 11/12"
/>`}
      >
        <div className="w-full max-w-[596px]">{earningsChart}</div>
      </Example>
      <Example
        title="Bar"
        code={`<Chart
  type="bar"
  values={[900, 1350, 1100, 1750, 1470, 1910, 1240]}
  labels={["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]}
  yLabels={["2k", "1k", "0"]}
  max={2000}
  seriesLabel="Views"
  legend={<LegendItem>Views</LegendItem>}
  aria-label="Views per day this week"
/>`}
      >
        <Chart
          type="bar"
          values={[900, 1350, 1100, 1750, 1470, 1910, 1240]}
          labels={["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]}
          yLabels={["2k", "1k", "0"]}
          max={2000}
          seriesLabel="Views"
          legend={<LegendItem>Views</LegendItem>}
          aria-label="Views per day this week"
          className="w-full max-w-[596px]"
        />
      </Example>
      <Example
        title="Comparison"
        description="compare draws a gray context line behind the blue series; the tooltip reads both at the hovered day."
        code={`<Chart
  values={campaignViews}
  compare={{ label: "Your average", values: averageViews }}
  seriesLabel="This campaign"
  pointLabels={days}         // "Oct 5", …
  labels={["Oct 5", "", …, "Oct 18"]}
  yLabels={["12k", "6k", "0"]}
  min={0}
  max={12000}
  legend={<><LegendItem>This campaign</LegendItem><LegendItem variant="context">Your average</LegendItem></>}
  aria-label="Views per day, this campaign vs. your average, Oct 5 to Oct 18"
/>`}
      >
        <Chart
          values={campaignViews}
          compare={{ label: "Your average", values: averageViews }}
          seriesLabel="This campaign"
          pointLabels={days}
          labels={days.map((day, i) => (i === 0 || i === 13 ? day : ""))}
          yLabels={["12k", "6k", "0"]}
          min={0}
          max={12000}
          legend={
            <>
              <LegendItem>This campaign</LegendItem>
              <LegendItem variant="context">Your average</LegendItem>
            </>
          }
          aria-label="Views per day, this campaign vs. your average, Oct 5 to Oct 18"
          className="w-full max-w-[596px]"
        />
      </Example>
      <Example
        title="Earnings dashboard"
        description="A success banner, three stat tiles and the earnings chart."
        code={`<Banner onClose={…}>Way to go! You’re making more than you made last month.</Banner>
<div className="grid grid-cols-3 gap-4">
  <StatTile icon={<RiMoneyDollarCircleLine {...iconProps} />} label="Earned this month" value="$612" trend={{ text: "+24%", direction: "up" }} />
  <StatTile icon={<RiFileList3Line {...iconProps} />} label="Active assignments" value="3" />
  <StatTile icon={<RiTimeLine {...iconProps} />} label="Avg. approval time" value="1.4 days" trend={{ text: "-0.3d", direction: "down", tone: "primary" }} />
</div>
<Chart values={earnings} todayIndex={40} … />`}
      >
        <EarningsDashboard />
      </Example>
    </>
  );
}
