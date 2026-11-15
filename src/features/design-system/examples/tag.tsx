"use client";

import { RiTimeLine } from "@remixicon/react";
import { useEffect, useRef, useState } from "react";
import { Tag } from "@/components/ui/badge";
import { Example } from "@/features/design-system/components/docs/example";
import { focusRing } from "@/lib/styles";
import { cn } from "@/lib/utils";

const initialSkills = ["React", "TypeScript", "Figma"];

export function TagExamples() {
  const [skills, setSkills] = useState(initialSkills);
  const group = useRef<HTMLDivElement>(null);
  const focusAfterRemove = useRef<number | null>(null);

  // A removed tag takes focus with it, so hand it to the next remove button, or the reset
  // button once none are left.
  useEffect(() => {
    const index = focusAfterRemove.current;
    if (index === null) return;
    focusAfterRemove.current = null;
    const buttons = group.current?.querySelectorAll<HTMLButtonElement>("button");
    buttons?.[Math.min(index, buttons.length - 1)]?.focus();
  }, [skills]);

  return (
    <>
      <Example
        title="Tones and sizes"
        description="Neutral, primary and destructive, in sm (12px) and md (14px)."
        code={`<Tag tone="primary">Applied</Tag>
<Tag>3/20 spots left</Tag>
<Tag tone="primary" size="md">In Review</Tag>
<Tag tone="destructive" size="md">Due in 3 days</Tag>
<Tag icon={RiTimeLine}>Waiting 6d</Tag>
<Tag tone="primary">New</Tag>`}
      >
        <Tag tone="primary">Applied</Tag>
        <Tag>3/20 spots left</Tag>
        <Tag tone="primary" size="md">
          In Review
        </Tag>
        <Tag tone="destructive" size="md">
          Due in 3 days
        </Tag>
        <Tag icon={RiTimeLine}>Waiting 6d</Tag>
        <Tag tone="primary">New</Tag>
      </Example>
      <Example
        title="Removable"
        description="onRemove adds a × button. Used for multi-select values."
        code={`const [skills, setSkills] = useState(["React", "TypeScript", "Figma"]);

{skills.map((skill) => (
  <Tag
    key={skill}
    size="md"
    onRemove={() => setSkills(skills.filter((s) => s !== skill))}
  >
    {skill}
  </Tag>
))}`}
      >
        <div ref={group} className="flex flex-wrap items-center gap-2">
          {skills.map((skill, index) => (
            <Tag
              key={skill}
              size="md"
              onRemove={() => {
                focusAfterRemove.current = index;
                setSkills(skills.filter((s) => s !== skill));
              }}
            >
              {skill}
            </Tag>
          ))}
          {skills.length === 0 ? (
            <button
              type="button"
              onClick={() => setSkills(initialSkills)}
              className={cn(
                "cursor-pointer rounded-xs text-body-sm font-medium text-blue-primary",
                focusRing,
              )}
            >
              Reset tags
            </button>
          ) : null}
        </div>
      </Example>
    </>
  );
}
