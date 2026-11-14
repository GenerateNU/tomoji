"use client";

import { RiMoneyDollarCircleLine, RiTimeLine } from "@remixicon/react";
import type { ReactNode } from "react";
import { Modal } from "@/components/modal";
import { Badge } from "@/components/ui/badge";
import { formatDeadline } from "@/features/opportunities/lib/format";
import { iconProps } from "@/lib/icons";
import { formatCompensation } from "@/lib/money";
import { labelOf, type CatalogOptions } from "../hooks/use-catalog-options";
import { FOLLOWER_RANGES, type OpportunityInput } from "../lib/opportunity-form";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-body text-gray-500">{title}</h3>
      {children}
    </section>
  );
}

function Tags({ names, options }: { names: string[]; options: CatalogOptions["niches"] }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {names.map((name) => (
        <li key={name}>
          <Badge>{labelOf(options, name)}</Badge>
        </li>
      ))}
    </ul>
  );
}

/** "10 slots · Followers: 10K – 50K": capacity and reach on one line. */
export function slotsAndReach(input: Pick<OpportunityInput, "maxSlots" | "minFollowerRange">) {
  const range = FOLLOWER_RANGES.find((option) => option.value === input.minFollowerRange);
  const slots = `${input.maxSlots} ${input.maxSlots === 1 ? "slot" : "slots"}`;
  return range ? `${slots} · Followers: ${range.label}` : slots;
}

/**
 * The brief as creators will read it, before it's saved. Apply actions are left
 * out: nothing here can be acted on yet.
 */
export function OpportunityPreview({
  open,
  onOpenChange,
  input,
  catalog,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  input: OpportunityInput;
  catalog: CatalogOptions;
}) {
  const requirements = input.contentRequirements.split("\n").filter((line) => line.trim());
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      eyebrow={<span className="text-body-sm text-gray-500">Preview · what creators see</span>}
      title={input.title}
      titleSize="lg"
      titleAddon={<Badge>{input.isGated ? "Application required" : "Open to claim"}</Badge>}
      className="max-h-[90vh] sm:max-w-2xl"
    >
      <div className="flex flex-col gap-6">
        <p className="text-body whitespace-pre-line text-gray-950">{input.description}</p>
        <div className="flex flex-col gap-2 text-body-sm text-gray-700">
          <p className="flex items-center gap-2">
            <RiTimeLine {...iconProps} className="text-gray-400" />
            Apply by{" "}
            <span className="font-medium text-gray-950">{formatDeadline(input.deadline - 1)}</span>
          </p>
          <p className="flex items-center gap-2">
            <RiMoneyDollarCircleLine {...iconProps} className="text-gray-400" />
            {formatCompensation(input)}
          </p>
        </div>
        <hr className="border-gray-100" />
        <Section title="Details">
          <p className="text-body-sm text-gray-950">{slotsAndReach(input)}</p>
        </Section>
        {(input.skills?.length ?? 0) > 0 && (
          <Section title="Skills">
            <Tags names={input.skills!} options={catalog.skills} />
          </Section>
        )}
        {(input.niches?.length ?? 0) > 0 && (
          <Section title="Niche">
            <Tags names={input.niches!} options={catalog.niches} />
          </Section>
        )}
        {(input.languages?.length ?? 0) > 0 && (
          <Section title="Languages">
            <Tags names={input.languages!} options={catalog.languages} />
          </Section>
        )}
        <Section title="Content requirements">
          <ul className="list-disc pl-5 text-body-sm text-gray-950">
            {requirements.map((line, index) => (
              <li key={index}>{line}</li>
            ))}
          </ul>
        </Section>
        <Section title="Deliverables">
          <ol className="flex flex-col gap-2 text-body-sm text-gray-950">
            {input.deliverables?.map((deliverable, index) => (
              <li key={index}>
                <p className="font-medium">{deliverable.title}</p>
                <p className="whitespace-pre-line text-gray-700">{deliverable.description}</p>
              </li>
            ))}
          </ol>
        </Section>
        <Section title="Policy guidelines">
          <p className="text-body-sm whitespace-pre-line text-gray-950">{input.reviewPolicy}</p>
        </Section>
      </div>
    </Modal>
  );
}
