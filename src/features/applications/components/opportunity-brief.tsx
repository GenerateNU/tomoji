import type { CreatorOpportunity } from "@convex/models/opportunities";
import { BanknoteIcon, ClockIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { formatCompensation, formatDeadline } from "@/features/opportunities/lib/format";
import { Section } from "./section";
import { SkillTags } from "./skill-tags";
import { Tags } from "./tags";
import { TextSection } from "./text-section";

/** What a creator reads before deciding to apply. */
export function OpportunityBrief({
  opportunity,
  onApply,
}: {
  opportunity: CreatorOpportunity;
  onApply: () => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        {/* Company logos aren't stored yet; a grey square stands in, as in the Figma. */}
        <div className="size-10 rounded-lg bg-muted" />
        <span>{opportunity.companyName}</span>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <DialogTitle className="text-2xl font-semibold">{opportunity.title}</DialogTitle>
          {opportunity.isGated && <Badge variant="secondary">Application required</Badge>}
        </div>
        <DialogDescription className="text-foreground">{opportunity.description}</DialogDescription>
        <p className="flex items-center gap-2 text-muted-foreground">
          <ClockIcon className="size-4" aria-hidden />
          Apply by {formatDeadline(opportunity.deadline)}
        </p>
        <p className="flex items-center gap-2 text-muted-foreground">
          <BanknoteIcon className="size-4" aria-hidden />
          {formatCompensation(opportunity)}
        </p>
      </div>

      <Button
        size="lg"
        className="w-fit px-12"
        onClick={onApply}
        disabled={!opportunity.isGated || opportunity.status !== "open"}
      >
        Apply
      </Button>

      <Separator />

      <div className="grid grid-cols-2 gap-6">
        <SkillTags niches={opportunity.niches} />
        {/* HARDCODED: opportunities don't store years of experience yet. */}
        <Section label="Years of experience">
          <Tags tags={[">1 year"]} />
        </Section>
      </div>
      {/* HARDCODED: opportunities don't store a content cadence yet. */}
      <Section label="Content">
        <Tags tags={["3–5 videos/wk"]} />
      </Section>

      {/* Not matching from the Figma, matching from the database - taking styling from Figma.*/}
      <TextSection label="Who they're looking for" text={opportunity.targetApplicant} />
      <TextSection label="Content requirements" text={opportunity.contentRequirements} />
      <TextSection label="Disclosure requirements" text={opportunity.disclosureRequirements} />
      <TextSection label="Prohibited claims" text={opportunity.prohibitedClaims} />
      <TextSection label="Usage rights" text={opportunity.usageRights} />
    </div>
  );
}
