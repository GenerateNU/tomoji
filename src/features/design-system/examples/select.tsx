"use client";

import { useState } from "react";
import { MultiSelectField } from "@/components/multi-select-field";
import { SelectField } from "@/components/select-field";
import { Example } from "@/features/design-system/components/docs/example";

const types = [
  { value: "ugc", label: "UGC video" },
  { value: "sponsored", label: "Sponsored post" },
  { value: "review", label: "Product review" },
];

const niches = [
  { value: "frontend", label: "Frontend Development" },
  { value: "backend", label: "Backend Development" },
  { value: "fullstack", label: "Full-Stack Development" },
  { value: "mobile", label: "Mobile App Development" },
  { value: "devops", label: "DevOps & Infrastructure" },
  { value: "ai", label: "AI / ML" },
];

const sorts = [
  { value: "recent", label: "Most recently posted" },
  { value: "pay", label: "Highest pay" },
  { value: "closing", label: "Closing soon" },
];

export function SelectExamples() {
  const [type, setType] = useState<string | null>(null);
  const [niche, setNiche] = useState<string | null>("backend");
  const [sort, setSort] = useState<string | null>("recent");
  const [many, setMany] = useState(["backend", "ai", "devops"]);
  const [picked, setPicked] = useState<string[]>([]);

  return (
    <>
      <Example
        title="Opportunity filters"
        description="Single selects in a row. The open list is the Menu."
        canvasClassName="items-start"
        code={`<SelectField label="Type" placeholder="Select type" options={types} value={type} onValueChange={setType} />
<SelectField label="Niches" options={niches} value={niche} onValueChange={setNiche} />
<SelectField label="Sort by" options={sorts} value={sort} onValueChange={setSort} />`}
      >
        <SelectField
          className="w-60"
          label="Type"
          placeholder="Select type"
          options={types}
          value={type}
          onValueChange={setType}
        />
        <SelectField
          className="w-60"
          label="Niches"
          options={niches}
          value={niche}
          onValueChange={setNiche}
        />
        <SelectField
          className="w-60"
          label="Sort by"
          options={sorts}
          value={sort}
          onValueChange={setSort}
        />
      </Example>
      <Example
        title="Multi-select"
        description="Chosen values show as removable Tags. Open it for search, checkboxes and Clear / Done."
        canvasClassName="items-start"
        code={`const [many, setMany] = useState(["backend", "ai", "devops"]);

<MultiSelectField
  label="Niches"
  placeholder="Select one or more niches"
  searchPlaceholder="Search niches"
  helper="Pick up to 5"
  options={niches}
  value={many}
  onValueChange={setMany}
/>`}
      >
        <MultiSelectField
          className="w-80"
          label="Niches"
          placeholder="Select one or more niches"
          searchPlaceholder="Search niches"
          helper="Pick up to 5"
          options={niches}
          value={many}
          onValueChange={setMany}
        />
      </Example>
      <Example
        title="Error"
        canvasClassName="items-start"
        code={`<MultiSelectField
  label="Niches"
  placeholder="Select one or more niches"
  error="Pick at least one niche"
  options={niches}
  value={picked}
  onValueChange={setPicked}
/>`}
      >
        <MultiSelectField
          className="w-80"
          label="Niches"
          placeholder="Select one or more niches"
          error="Pick at least one niche"
          options={niches}
          value={picked}
          onValueChange={setPicked}
        />
      </Example>
    </>
  );
}
