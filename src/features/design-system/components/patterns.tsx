"use client";

import { useState } from "react";
import { EyeIcon, HeartIcon, MessageCircleIcon } from "lucide-react";
import { AssignmentRow } from "@/components/assignment-row";
import { Banner } from "@/components/banner";
import { BrandButton } from "@/components/brand-button";
import { BarChart } from "@/components/charts/bar-chart";
import { BarList } from "@/components/charts/bar-list";
import { Heatmap } from "@/components/charts/heatmap";
import { LineChart } from "@/components/charts/line-chart";
import { CountdownButton } from "@/components/countdown-button";
import { ProgressRing } from "@/components/progress-ring";
import { SelectableCard } from "@/components/selectable-card";
import { StatTile } from "@/components/stat-tile";
import { Button } from "@/components/ui/button";
import { PreviewSection } from "./preview-section";

const dollars = (value: number) => `$${Math.round(value)}`;
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

export function BannerPreview() {
  const [dismissed, setDismissed] = useState(false);
  return (
    <PreviewSection
      id="banner"
      title="Banner"
      description="An inline message on a page, in the Icon Container tones. Add a small ghost button in the tone's color for a follow-up, and a close button when it can be dismissed."
    >
      <div className="max-w-xl space-y-3">
        {!dismissed && (
          <Banner tone="success" onDismiss={() => setDismissed(true)}>
            Way to go! You&apos;re making more than you made last month.
          </Banner>
        )}
        <Banner
          action={
            <Button variant="secondary-ghost" size="sm">
              Connect
            </Button>
          }
        >
          Payouts are sent every Friday. Connect Stripe to get paid.
        </Banner>
        <Banner
          tone="error"
          action={
            <Button variant="destructive-ghost" size="sm">
              Reconnect
            </Button>
          }
        >
          Your X account was disconnected. Reconnect to keep posting.
        </Banner>
      </div>
    </PreviewSection>
  );
}

export function StatPreview() {
  return (
    <PreviewSection
      id="stat-tile"
      title="Stat tile & progress ring"
      description="A stat tile shows one metric, with a tag for the change since last period. A progress ring shows how far along something is, like profile completion."
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile
          icon={<EyeIcon />}
          label="Views"
          value="1.2M"
          trend={{ text: "+18%", direction: "up" }}
        />
        <StatTile
          icon={<HeartIcon />}
          label="Likes"
          value="100,850"
          trend={{ text: "+12%", direction: "up" }}
        />
        <StatTile
          icon={<MessageCircleIcon />}
          label="Comments"
          value="4,312"
          trend={{ text: "-3%", direction: "down" }}
        />
      </div>
      <StatTile
        layout="horizontal"
        className="max-w-100"
        icon={<EyeIcon />}
        label="Views"
        value="1.2M"
      />
      <div className="flex max-w-md items-center gap-4 rounded-lg bg-card p-4 shadow-card">
        <ProgressRing value={40} label="Profile completion" />
        <div className="space-y-0.5">
          <p className="font-medium">Complete your profile</p>
          <p className="text-body-sm text-muted-foreground">
            Add a bio and portfolio links to get more offers
          </p>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <ProgressRing size="sm" value={70} label="Example progress" />
        <ProgressRing size="sm" value={100} label="Example progress" showLabel={false} />
      </div>
    </PreviewSection>
  );
}

export function ActionPreview() {
  const [runs, setRuns] = useState(0);
  return (
    <PreviewSection
      id="brand-button"
      title="Brand & countdown buttons"
      description="Brand buttons start a third-party action and follow each brand's logo rules. A countdown button completes itself, e.g. Done on a success dialog."
    >
      <div className="grid max-w-sm gap-3">
        <BrandButton brand="google" label="Continue with" />
        <BrandButton brand="apple" label="Continue with" />
        <BrandButton brand="x" label="View on" external />
        <BrandButton brand="stripe" variant="primary" label="Connect with" />
        <BrandButton brand="x" variant="secondary" label="View on" />
      </div>
      <div className="flex max-w-sm flex-col items-center gap-4 rounded-lg bg-card p-6 text-center shadow-card">
        <div className="space-y-1">
          <p className="text-body-lg font-medium">Submission sent</p>
          <p className="text-body-sm text-muted-foreground">
            The brand will review your video within 3 days.
          </p>
        </div>
        <CountdownButton key={runs} className="w-60" onComplete={() => undefined}>
          Done
        </CountdownButton>
        <Button variant="secondary-ghost" size="sm" onClick={() => setRuns((value) => value + 1)}>
          Restart countdown
        </Button>
      </div>
    </PreviewSection>
  );
}

const REASONS = [
  { title: "Audio quality", description: "Background noise or low volume" },
  { title: "Missing talking points", description: "The video skips required points" },
  { title: "Wrong format", description: "Needs to be vertical, under 60 seconds" },
];

export function ListPreview() {
  return (
    <PreviewSection
      id="assignment-row"
      title="Assignment row & selectable card"
      description="Assignment rows list a creator's to-dos with a status icon and due tag. Selectable cards are multi-select options where the whole card is the hit target."
    >
      <div className="max-w-md space-y-2 rounded-lg bg-gray-25 p-5">
        <AssignmentRow
          href="#assignment-row"
          status="overdue"
          title="Yeti Clear Cup"
          due="2 days overdue"
        />
        <AssignmentRow
          href="#assignment-row"
          status="todo"
          title="Claude Opus 5.5 launch video"
          due="Due in 1 day"
        />
        <AssignmentRow
          href="#assignment-row"
          status="todo"
          title="Design Workflow Walkthrough: From Brief to Final Cut in One Afternoon"
          due="Due in 5 days"
        />
        <AssignmentRow
          href="#assignment-row"
          status="submitted"
          title="Notion Calendar tips"
          due="Submitted"
        />
      </div>
      <div className="max-w-lg space-y-5 rounded-lg bg-gray-25 p-5">
        <p className="text-heading-sm">What needs to change?</p>
        <div className="space-y-2">
          {REASONS.map((reason, index) => (
            <SelectableCard key={reason.title} defaultChecked={index === 0} {...reason} />
          ))}
          <SelectableCard title="Something else" description="Unavailable for this post" disabled />
        </div>
      </div>
    </PreviewSection>
  );
}

const EARNING_DAYS = Array.from({ length: 23 }, (_, index) => `Oct ${index + 1}`);
const EARNED = [90, 95, 110, 120, 150, 180, 200, 230, 260, 300, 340, 380, 420, 470, 520, 560];
const PROJECTED = [560, 575, 585, 592, 596, 598, 600, 600];
const THIS_CAMPAIGN = [
  2000, 2600, 3400, 4100, 5200, 6100, 7400, 7900, 8600, 9100, 9800, 10400, 11000, 11500,
];
const AVERAGE = [
  1500, 1800, 2100, 2400, 2700, 2900, 3000, 3300, 3600, 3900, 4200, 4500, 4800, 5100,
];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOURS = Array.from({ length: 24 }, (_, hour) =>
  hour === 0 ? "12 AM" : hour < 12 ? `${hour} AM` : hour === 12 ? "12 PM" : `${hour - 12} PM`,
);
// Evenings and weekends get the most engagement.
const ENGAGEMENT = DAYS.map((_, day) =>
  HOURS.map((_, hour) => {
    const evening = Math.max(0, 1 - Math.abs(hour - 19) / 6);
    const weekend = day >= 5 ? 0.3 : 0;
    return Math.round(1200 * Math.min(1, evening + weekend * (hour > 9 ? 1 : 0)));
  }),
);

export function ChartPreview() {
  return (
    <PreviewSection
      id="charts"
      title="Charts"
      description="Hand-built charts for dashboards. Hover, or focus and use the arrow keys, to read exact values; screen readers get the data as a table."
    >
      <LineChart
        title="Earnings in October, with a projection to the end of the month"
        labels={EARNING_DAYS}
        series={[
          {
            label: "Earnings",
            kind: "primary",
            values: [...EARNED, ...Array<null>(EARNING_DAYS.length - EARNED.length).fill(null)],
          },
          {
            label: "Projected",
            kind: "projected",
            values: [...Array<null>(EARNED.length - 1).fill(null), ...PROJECTED],
          },
        ]}
        max={600}
        yTicks={["$600", "$300", "$0"]}
        xTicks={[
          { index: 0, label: "Oct 1" },
          { index: 15, label: "Today" },
          { index: 22, label: "Oct 23" },
        ]}
        todayIndex={15}
        formatValue={dollars}
      />
      <LineChart
        title="Views on this campaign compared with your average"
        labels={THIS_CAMPAIGN.map((_, index) => `Oct ${index + 5}`)}
        series={[
          { label: "This campaign", kind: "primary", values: THIS_CAMPAIGN },
          { label: "Your average", kind: "context", values: AVERAGE },
        ]}
        max={12000}
        yTicks={["12k", "6k", "0"]}
        xTicks={[
          { index: 0, label: "Oct 5" },
          { index: 13, label: "Oct 18" },
        ]}
        formatValue={(value) => value.toLocaleString("en-US")}
      />
      <BarChart
        title="Views by day this week"
        seriesLabel="Views"
        data={[1400, 1100, 1700, 900, 2000, 1600, 1200].map((value, index) => ({
          label: DAYS[index],
          value,
        }))}
        max={2000}
        yTicks={["2k", "1k", "0"]}
        formatValue={(value) => value.toLocaleString("en-US")}
      />
      <BarList
        className="max-w-140"
        items={[
          { label: "Maya", value: 24100 },
          { label: "Jordan", value: 21300 },
          { label: "You", value: 18400 },
          { label: "Sam", value: 12900 },
          { label: "Priya", value: 8700 },
        ]}
        highlight="You"
        formatValue={(value) => compact.format(value)}
      />
      <Heatmap
        title="Engagement by day and hour"
        rows={DAYS}
        columns={HOURS}
        columnTicks={[
          { index: 0, label: "12a" },
          { index: 6, label: "6a" },
          { index: 12, label: "12p" },
          { index: 18, label: "6p" },
        ]}
        values={ENGAGEMENT}
        valueLabel="Engagements"
        formatValue={(value) => value.toLocaleString("en-US")}
      />
    </PreviewSection>
  );
}
