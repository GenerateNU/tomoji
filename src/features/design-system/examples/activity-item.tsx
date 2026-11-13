"use client";

import { useState } from "react";
import {
  RiBankLine,
  RiCheckLine,
  RiCloseLine,
  RiErrorWarningLine,
  RiSearchLine,
  RiVideoOnLine,
} from "@remixicon/react";
import { ActivityItem } from "@/components/activity-item";
import { FilterChip } from "@/components/filter-chip";
import { Example } from "@/features/design-system/components/docs/example";
import type { IconComponent } from "@/lib/icons";
import { focusRing } from "@/lib/styles";
import { cn } from "@/lib/utils";

type Notification = {
  id: string;
  status: "unread" | "read" | "warning";
  icon: IconComponent;
  title: string;
  description: string;
  timestamp: string;
};

const NOTIFICATIONS: Notification[] = [
  {
    id: "due-3",
    status: "unread",
    icon: RiVideoOnLine,
    title: "Yeti Clear Cup is due in 3 days",
    description: "Go to the assignment and upload your video for review",
    timestamp: "Oct 26 at 6:20pm",
  },
  {
    id: "accepted",
    status: "unread",
    icon: RiCheckLine,
    title: "Your application was accepted",
    description: "Anthropic accepted you for Claude Opus 5.5",
    timestamp: "Oct 26 at 2:04pm",
  },
  {
    id: "payout",
    status: "unread",
    icon: RiBankLine,
    title: "Payout sent",
    description: "$450.00 is on its way to your bank account",
    timestamp: "Oct 25 at 9:12am",
  },
  {
    id: "changes",
    status: "warning",
    icon: RiErrorWarningLine,
    title: "Submission needs changes",
    description: "The brand left feedback on your Opus 5.5 walkthrough",
    timestamp: "Oct 24 at 4:47pm",
  },
  {
    id: "match",
    status: "read",
    icon: RiSearchLine,
    title: "New opportunity matches your niche",
    description: "Design Workflow Walkthrough · AI / ML",
    timestamp: "Oct 22 at 11:30am",
  },
  {
    id: "due-7",
    status: "read",
    icon: RiVideoOnLine,
    title: "Yeti Clear Cup is due in 7 days",
    description: "Go to the assignment and upload your video for review",
    timestamp: "Oct 22 at 6:20pm",
  },
];

function NotificationsPanel() {
  const [items, setItems] = useState(NOTIFICATIONS);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const unreadCount = items.filter((item) => item.status !== "read").length;
  const visible = unreadOnly ? items.filter((item) => item.status !== "read") : items;

  return (
    <div className="flex w-[398px] max-w-full flex-col gap-4 rounded-lg bg-gray-0 p-4 shadow-overlay">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-heading-sm font-medium text-gray-950">Notifications</h2>
        <button
          type="button"
          aria-label="Close"
          className={cn("cursor-pointer rounded-xs text-gray-950", focusRing)}
        >
          <RiCloseLine size={24} aria-hidden />
        </button>
      </div>
      <div className="flex">
        <FilterChip count={unreadCount} selected={unreadOnly} onPressedChange={setUnreadOnly}>
          Unreads
        </FilterChip>
      </div>
      <div className="flex flex-col gap-1">
        {visible.map((item) => (
          <ActivityItem
            key={item.id}
            status={item.status}
            icon={item.icon}
            title={item.title}
            description={item.description}
            timestamp={item.timestamp}
            onMenuClick={() =>
              setItems((value) =>
                value.map((entry) => (entry.id === item.id ? { ...entry, status: "read" } : entry)),
              )
            }
          />
        ))}
      </div>
    </div>
  );
}

export function ActivityItemExamples() {
  return (
    <>
      <Example
        title="Statuses"
        description="Unread is tinted blue with a dot, warning is tinted red, read is plain."
        canvasClassName="flex-col items-stretch"
        code={`<ActivityItem status="unread" icon={RiVideoOnLine} title="Yeti Clear Cup is due in 3 days"
  description="Go to the assignment and upload your video for review" timestamp="Oct 26 at 6:20pm" />
<ActivityItem status="read" … />
<ActivityItem status="warning" icon={RiErrorWarningLine} … />`}
      >
        <div className="flex w-full max-w-xl flex-col gap-1 self-center">
          <ActivityItem
            status="unread"
            icon={RiVideoOnLine}
            title="Yeti Clear Cup is due in 3 days"
            description="Go to the assignment and upload your video for review"
            timestamp="Oct 26 at 6:20pm"
          />
          <ActivityItem
            status="read"
            icon={RiVideoOnLine}
            title="Yeti Clear Cup is due in 3 days"
            description="Go to the assignment and upload your video for review"
            timestamp="Oct 26 at 6:20pm"
          />
          <ActivityItem
            status="warning"
            icon={RiErrorWarningLine}
            title="Yeti Clear Cup is due in 3 days"
            description="Go to the assignment and upload your video for review"
            timestamp="Oct 26 at 6:20pm"
          />
        </div>
      </Example>
      <Example
        title="Notifications panel"
        description="The ••• menu marks an item read; the Unreads chip filters the list."
        code={`<FilterChip count={4}>Unreads</FilterChip>
<div className="flex flex-col gap-1">
  <ActivityItem status="unread" icon={RiCheckLine} title="Your application was accepted"
    description="Anthropic accepted you for Claude Opus 5.5" timestamp="Oct 26 at 2:04pm" />
  <ActivityItem status="warning" icon={RiErrorWarningLine} title="Submission needs changes" … />
  <ActivityItem status="read" icon={RiSearchLine} title="New opportunity matches your niche" … />
</div>`}
      >
        <NotificationsPanel />
      </Example>
    </>
  );
}
