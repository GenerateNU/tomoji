"use client";

import { RiDeleteBinLine, RiFileCopyLine, RiPencilLine } from "@remixicon/react";
import { useState } from "react";
import { MultiSelectField } from "@/components/multi-select-field";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSectionLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Example } from "@/features/design-system/components/docs/example";

const sorts = ["Newest", "Oldest", "Most popular"];

const viewOptions = [
  "4M+",
  "2M–4M",
  "1M–2M",
  "5K–1M",
  "0–5K",
  "Frontend Development",
  "Backend Development",
  "Full-Stack Development",
  "Mobile App Development",
  "DevOps & Infrastructure",
].map((label) => ({ value: label, label }));

export function MenuExamples() {
  const [sort, setSort] = useState("Newest");

  return (
    <>
      <Example
        title="Actions"
        description="Overflow menu with icons. Destructive actions go last, after a divider."
        code={`<DropdownMenu>
  <DropdownMenuTrigger render={<Button variant="secondary-subtle" size="sm" />}>
    Actions
  </DropdownMenuTrigger>
  <DropdownMenuContent>
    <DropdownMenuItem icon={RiFileCopyLine}>Copy</DropdownMenuItem>
    <DropdownMenuItem icon={RiPencilLine}>Edit</DropdownMenuItem>
    <DropdownMenuSeparator />
    <DropdownMenuItem icon={RiDeleteBinLine} variant="destructive">
      Delete
    </DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>`}
      >
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="secondary-subtle" size="sm" />}>
            Actions
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem icon={RiFileCopyLine}>Copy</DropdownMenuItem>
            <DropdownMenuItem icon={RiPencilLine}>Edit</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem icon={RiDeleteBinLine} variant="destructive">
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="secondary-subtle" size="sm" />}>
            With disabled item
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem icon={RiPencilLine}>Edit</DropdownMenuItem>
            <DropdownMenuItem icon={RiPencilLine} disabled>
              Edit (disabled)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </Example>
      <Example
        title="Single choice"
        description="A section label, a blue check on the chosen option, and a chevron into a sub-menu. Click to choose."
        code={`<DropdownMenu>
  <DropdownMenuTrigger render={<Button variant="secondary-subtle" size="sm" />}>
    Sort: {sort}
  </DropdownMenuTrigger>
  <DropdownMenuContent>
    <DropdownMenuSectionLabel>Sort by</DropdownMenuSectionLabel>
    <DropdownMenuRadioGroup value={sort} onValueChange={setSort}>
      {sorts.map((s) => (
        <DropdownMenuRadioItem key={s} value={s}>
          {s}
        </DropdownMenuRadioItem>
      ))}
    </DropdownMenuRadioGroup>
    <DropdownMenuSeparator />
    <DropdownMenuItem chevron>More filters</DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>`}
      >
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="secondary-subtle" size="sm" />}>
            Sort: {sort}
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuSectionLabel>Sort by</DropdownMenuSectionLabel>
            <DropdownMenuRadioGroup value={sort} onValueChange={setSort}>
              {sorts.map((s) => (
                <DropdownMenuRadioItem key={s} value={s}>
                  {s}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem chevron>More filters</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </Example>
      <Example
        title="Multi-select"
        description="Checkbox items, with a search row and a footer for the count and Clear / Done."
        canvasClassName="items-start"
        code={`<MultiSelectField
  label="Filter views"
  placeholder="Choose views"
  searchPlaceholder="Search niches"
  options={viewOptions}
  defaultValue={["2M–4M", "Frontend Development", "Backend Development", "DevOps & Infrastructure"]}
/>`}
      >
        <MultiSelectField
          className="w-80"
          label="Filter views"
          placeholder="Choose views"
          searchPlaceholder="Search niches"
          options={viewOptions}
          defaultValue={[
            "2M–4M",
            "Frontend Development",
            "Backend Development",
            "DevOps & Infrastructure",
          ]}
        />
      </Example>
    </>
  );
}
