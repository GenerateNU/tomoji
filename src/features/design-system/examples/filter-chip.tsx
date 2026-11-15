"use client";

import { useState } from "react";
import { RiCheckboxCircleLine, RiListCheck3, RiStarLine } from "@remixicon/react";
import { FilterChip } from "@/components/filter-chip";
import { Example } from "@/features/design-system/components/docs/example";

const NOTIFICATION_TYPES = [
  { id: "unread", label: "Unread", count: 36 },
  { id: "applications", label: "Applications", count: 12 },
  { id: "assignments", label: "Assignments", count: 4 },
  { id: "posts", label: "Posts", count: 8 },
  { id: "disputes", label: "Disputes", count: 12 },
];

export function FilterChipExamples() {
  const [on, setOn] = useState(["applied"]);
  const [type, setType] = useState("unread");
  const toggle = (id: string) =>
    setOn((value) => (value.includes(id) ? value.filter((x) => x !== id) : [...value, id]));

  return (
    <>
      <Example
        title="Opportunity quick filters"
        description="Toggle chips with icons. A selected chip swaps its icon for × to show it can be cleared."
        code={`const [on, setOn] = useState(["applied"]);
const toggle = (id: string) => setOn(on.includes(id) ? on.filter((x) => x !== id) : [...on, id]);

<FilterChip icon={RiCheckboxCircleLine} selected={on.includes("applied")} onPressedChange={() => toggle("applied")}>Applied</FilterChip>
<FilterChip icon={RiStarLine} selected={on.includes("starred")} onPressedChange={() => toggle("starred")}>Starred</FilterChip>
<FilterChip icon={RiListCheck3} selected={on.includes("eligible")} onPressedChange={() => toggle("eligible")}>Jobs I'm eligible for</FilterChip>`}
      >
        <FilterChip
          icon={RiCheckboxCircleLine}
          selected={on.includes("applied")}
          onPressedChange={() => toggle("applied")}
        >
          Applied
        </FilterChip>
        <FilterChip
          icon={RiStarLine}
          selected={on.includes("starred")}
          onPressedChange={() => toggle("starred")}
        >
          Starred
        </FilterChip>
        <FilterChip
          icon={RiListCheck3}
          selected={on.includes("eligible")}
          onPressedChange={() => toggle("eligible")}
        >
          Jobs I&apos;m eligible for
        </FilterChip>
      </Example>
      <Example
        title="Notification filters"
        description="Single-choice chips with counts."
        code={`<FilterChip count={36} selected={type === "unread"} onPressedChange={() => setType("unread")}>Unread</FilterChip>
<FilterChip count={12} selected={type === "applications"} onPressedChange={() => setType("applications")}>Applications</FilterChip>`}
      >
        {NOTIFICATION_TYPES.map((item) => (
          <FilterChip
            key={item.id}
            count={item.count}
            selected={type === item.id}
            onPressedChange={() => setType(item.id)}
          >
            {item.label}
          </FilterChip>
        ))}
      </Example>
      <Example
        title="Disabled"
        code={`<FilterChip icon={RiStarLine} disabled>Starred</FilterChip>
<FilterChip icon={RiStarLine} selected disabled>Starred</FilterChip>`}
      >
        <FilterChip icon={RiStarLine} disabled>
          Starred
        </FilterChip>
        <FilterChip icon={RiStarLine} selected disabled>
          Starred
        </FilterChip>
      </Example>
    </>
  );
}
