"use client";

import { api } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { RiArrowLeftLine, RiPencilLine } from "@remixicon/react";
import { useState, type ComponentProps, type ReactNode } from "react";
import { Banner } from "@/components/banner";
import { ErrorBoundary } from "@/components/error-boundary";
import { Modal } from "@/components/modal";
import { Tag } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsCount, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useNow } from "@/hooks/use-now";
import { errorCode } from "@/lib/errors";
import { focusRing } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { DeliverableDetails } from "./deliverable-details";
import { DeliverableForm } from "./deliverable-form";
import { DeliverablesTab } from "./deliverables-tab";
import { deliverableRules, type DeliverableRules } from "./lib/deliverable-rules";

export type CompanyOpportunityModalProps = {
  /** The opportunity to show. Null renders nothing and reads nothing. */
  opportunityId: Id<"opportunities"> | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Shows the "Edit opportunity" button; the caller opens its own editor. */
  onEdit?: () => void;
};

// Figma calls a deliverable an "assignment". In the backend an assignment is
// a creator's claim on the opportunity, so code says deliverable and copy says
// assignment.
type View =
  | { kind: "list"; focus?: Id<"deliverables"> | "add" }
  | { kind: "new" }
  | { kind: "details"; deliverableId: Id<"deliverables"> }
  | { kind: "edit"; deliverableId: Id<"deliverables">; from: "list" | "details" };

const MODAL_CLASS = "h-[min(52rem,calc(100dvh-32px))] sm:max-w-[56rem]";

const STATUS_TAG: Record<
  Doc<"opportunities">["status"],
  { label: string; tone: "primary" | "neutral" }
> = {
  draft: { label: "Draft", tone: "neutral" },
  open: { label: "Live", tone: "primary" },
  paused: { label: "Paused", tone: "neutral" },
  closed: { label: "Closed", tone: "neutral" },
};

/**
 * The company's view of one opportunity: its assignments (backend
 * deliverables) and, in later tabs, the people and posts attached to it.
 */
export function CompanyOpportunityModal(props: CompanyOpportunityModalProps) {
  // A fresh boundary and view state each time the modal opens, so a failed
  // read or a half-finished form doesn't follow the user to the next opening.
  const [session, setSession] = useState(0);
  const [wasOpen, setWasOpen] = useState(props.open);
  if (props.open !== wasOpen) {
    setWasOpen(props.open);
    if (props.open) setSession((count) => count + 1);
  }
  if (props.opportunityId === null) return null;
  const key = `${props.opportunityId}:${session}`;
  return (
    <ErrorBoundary
      key={key}
      fallback={(error) => (
        <Modal
          open={props.open}
          onOpenChange={props.onOpenChange}
          title="Opportunity unavailable"
          className="sm:max-w-md"
        >
          <p className="text-body text-gray-700">
            {errorCode(error) === "not_found"
              ? "This opportunity was deleted or you no longer have access to it."
              : "Something went wrong loading this opportunity. Close this and try again."}
          </p>
        </Modal>
      )}
    >
      <OpportunityModalContent key={key} {...props} opportunityId={props.opportunityId} />
    </ErrorBoundary>
  );
}

function OpportunityModalContent({
  opportunityId,
  open,
  onOpenChange,
  onEdit,
}: CompanyOpportunityModalProps & { opportunityId: Id<"opportunities"> }) {
  const fetched = useQuery(api.opportunities.get, { opportunityId });
  // Only creators get the brief view (it carries `companyName`); a company
  // member never should, so treat it as unavailable rather than guess fields.
  const opportunity = fetched && "companyName" in fetched ? null : fetched;
  const campaign = useQuery(
    api.campaigns.get,
    opportunity ? { campaignId: opportunity.campaignId } : "skip",
  );
  const rows = useQuery(api.deliverables.list, { opportunityId });
  // One row is enough to know whether a creator has ever joined, which locks edits.
  const firstAssignment = useQuery(api.assignments.list, {
    opportunityId,
    paginationOpts: { numItems: 1, cursor: null },
  });
  const now = useNow();
  const [view, setView] = useState<View>({ kind: "list" });
  const [tab, setTab] = useState("assignments");

  const common = { open, onOpenChange, className: MODAL_CLASS, titleSize: "lg" } as const;

  if (opportunity === null) {
    return (
      <Modal {...common} titleSize="sm" className="sm:max-w-md" title="Opportunity unavailable">
        <p className="text-body text-gray-700">
          Only the company that owns this opportunity can manage it.
        </p>
      </Modal>
    );
  }

  if (opportunity === undefined || rows === undefined || campaign === undefined) {
    return (
      <Modal
        {...common}
        title={
          <>
            <span className="sr-only">Loading opportunity…</span>
            <Skeleton className="h-8 w-72 max-w-full" />
          </>
        }
      >
        <div aria-hidden className="flex flex-col gap-4">
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="mt-4 h-8 w-96 max-w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </Modal>
    );
  }

  // Company members always get stored rows; the creator view lacks `createdBy`.
  const deliverables = rows.filter((row): row is Doc<"deliverables"> => "createdBy" in row);
  const rules = deliverableRules({
    opportunityStatus: opportunity.status,
    campaignStatus: campaign.status,
    deadline: opportunity.deadline,
    hasAssignments: firstAssignment === undefined ? undefined : firstAssignment.page.length > 0,
    count: deliverables.length,
    now,
  });
  const backToList = (focus?: Id<"deliverables"> | "add") => setView({ kind: "list", focus });
  // Each view is a new screen in the same dialog, so its back button takes
  // focus (keyed by view so it remounts) unless a form field claims it.
  const back = (onClick: () => void, autoFocus: boolean) => (
    <BackButton key={view.kind} onClick={onClick} autoFocus={autoFocus} />
  );

  if (view.kind === "new") {
    return (
      <Modal {...common} eyebrow={back(() => backToList("add"), false)} title="New assignment">
        <DeliverableForm
          opportunityId={opportunityId}
          requireCriteria={opportunity.usesAiReviewDefault}
          onCancel={() => backToList("add")}
          onSaved={(deliverableId) => backToList(deliverableId)}
        />
      </Modal>
    );
  }

  if (view.kind === "details" || view.kind === "edit") {
    const deliverable = deliverables.find(({ _id }) => _id === view.deliverableId);
    if (!deliverable) {
      return (
        <Modal {...common} eyebrow={back(() => backToList(), true)} title="Assignment not found">
          <p className="text-body text-gray-700">
            This assignment was deleted. Go back to see the opportunity&apos;s current assignments.
          </p>
        </Modal>
      );
    }
    if (view.kind === "edit") {
      const leave = () =>
        view.from === "details"
          ? setView({ kind: "details", deliverableId: deliverable._id })
          : backToList(deliverable._id);
      return (
        <Modal
          {...common}
          eyebrow={back(() => backToList(deliverable._id), !rules.canChange)}
          title={`Edit ${deliverable.title}`}
        >
          {rules.canChange ? (
            <DeliverableForm
              opportunityId={opportunityId}
              deliverable={deliverable}
              requireCriteria={opportunity.usesAiReviewDefault}
              onCancel={leave}
              onSaved={() => setView({ kind: "details", deliverableId: deliverable._id })}
            />
          ) : (
            <LockedNotice rules={rules} />
          )}
        </Modal>
      );
    }
    return (
      <Modal
        {...common}
        eyebrow={back(() => backToList(deliverable._id), true)}
        title={deliverable.title}
        titleAddon={
          <Button
            variant="secondary-ghost"
            size="icon-sm"
            aria-label="Edit assignment"
            title={rules.canChange ? "Edit assignment" : rules.changeReason}
            disabled={!rules.canChange}
            onClick={() =>
              setView({ kind: "edit", deliverableId: deliverable._id, from: "details" })
            }
          >
            <RiPencilLine size={20} aria-hidden />
          </Button>
        }
      >
        <DeliverableDetails
          deliverable={deliverable}
          deadline={opportunity.deadline}
          notice={rules.canChange ? undefined : <LockedNotice rules={rules} />}
        />
      </Modal>
    );
  }

  const status = STATUS_TAG[opportunity.status];
  return (
    <Modal
      {...common}
      eyebrow={<span className="truncate text-body text-gray-500">{campaign.title}</span>}
      title={opportunity.title}
      titleAddon={<Tag tone={status.tone}>{status.label}</Tag>}
      actions={
        onEdit ? (
          <Button variant="secondary-subtle" size="sm" icon={RiPencilLine} onClick={onEdit}>
            <span className="max-sm:sr-only">Edit opportunity</span>
          </Button>
        ) : undefined
      }
    >
      <div className="flex h-full flex-col gap-4">
        <ExpandableText text={opportunity.description} />
        <Tabs value={tab} onValueChange={setTab} className="min-h-0 flex-1 gap-0">
          <TabsList className="shrink-0 overflow-x-auto overflow-y-hidden [scrollbar-width:none]">
            <TabsTrigger value="assignments">
              Assignments <TabsCount>{deliverables.length}</TabsCount>
            </TabsTrigger>
            <TabsTrigger value="posting">Posting</TabsTrigger>
            <TabsTrigger value="applications">Applications</TabsTrigger>
            <TabsTrigger value="creators">Creators</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>
          <TabPanel value="assignments">
            <DeliverablesTab
              opportunityId={opportunityId}
              deliverables={deliverables}
              campaignTitle={campaign.title}
              rules={rules}
              focusTarget={view.focus}
              onAdd={() => setView({ kind: "new" })}
              onOpen={(deliverableId) => setView({ kind: "details", deliverableId })}
              onEdit={(deliverableId) => setView({ kind: "edit", deliverableId, from: "list" })}
            />
          </TabPanel>
          <TabPanel value="posting">
            <ComingSoon>Posting arrives in a later update.</ComingSoon>
          </TabPanel>
          <TabPanel value="applications">
            <ComingSoon>Applications arrive in a later update.</ComingSoon>
          </TabPanel>
          <TabPanel value="creators">
            <ComingSoon>Creators arrive in a later update.</ComingSoon>
          </TabPanel>
          <TabPanel value="settings">
            <ComingSoon>Settings arrive in a later update.</ComingSoon>
          </TabPanel>
        </Tabs>
      </div>
    </Modal>
  );
}

/** A tab's gray, scrolling body under the tab bar. */
function TabPanel({ className, ...props }: ComponentProps<typeof TabsContent>) {
  return (
    <TabsContent
      className={cn(
        "min-h-0 overflow-y-auto rounded-b-lg bg-gray-25 p-3 sm:p-4 md:p-6",
        focusRing,
        className,
      )}
      {...props}
    />
  );
}

function ComingSoon({ children }: { children: ReactNode }) {
  return <p className="py-16 text-center text-body text-gray-500">{children}</p>;
}

function BackButton({ onClick, autoFocus }: { onClick: () => void; autoFocus: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      // Moves focus into the newly shown view of the open dialog.
      autoFocus={autoFocus}
      className={cn(
        "-mx-1 flex cursor-pointer items-center gap-1.5 rounded-xs px-1 text-body font-medium text-gray-950 hover:text-gray-700",
        focusRing,
      )}
    >
      <RiArrowLeftLine size={16} aria-hidden />
      <span>
        <span className="sr-only">Back to </span>
        Assignments
      </span>
    </button>
  );
}

function LockedNotice({ rules }: { rules: DeliverableRules }) {
  return <Banner tone="neutral">{rules.changeReason}</Banner>;
}

// Figma clips the description to two lines; long ones get a toggle so the
// rest stays reachable.
const CLAMP_AFTER = 180;

function ExpandableText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const long = text.length > CLAMP_AFTER;
  return (
    <div className="flex shrink-0 flex-col items-start gap-1">
      <p
        className={cn(
          "text-body whitespace-pre-line text-gray-500",
          long && !expanded && "line-clamp-2",
          expanded && "max-h-40 overflow-y-auto",
        )}
      >
        {text}
      </p>
      {long ? (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
          className={cn(
            "cursor-pointer rounded-xs text-body-sm font-medium text-primary hover:underline",
            focusRing,
          )}
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      ) : null}
    </div>
  );
}
