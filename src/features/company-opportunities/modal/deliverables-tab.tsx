"use client";

import { api } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import { useMutation } from "convex/react";
import {
  RiAddLine,
  RiDeleteBinLine,
  RiFileCopyLine,
  RiLockLine,
  RiMoreLine,
  RiPencilLine,
} from "@remixicon/react";
import { useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import { toast } from "sonner";
import { Banner } from "@/components/banner";
import { Modal } from "@/components/modal";
import { Spinner } from "@/components/spinner";
import { CompanyAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  TableBody,
  TableCard,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { focusRing } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { deliverableErrorMessage, type DeliverableRules } from "./lib/deliverable-rules";
import { formatModalDate } from "./lib/format";

type SortKey = "title" | "created" | "criteria";
type Sort = { key: SortKey; direction: "ascending" | "descending" };

const COMPARE: Record<SortKey, (a: Doc<"deliverables">, b: Doc<"deliverables">) => number> = {
  title: (a, b) => a.title.localeCompare(b.title),
  created: (a, b) => a._creationTime - b._creationTime,
  criteria: (a, b) => (a.reviewCriteria?.length ?? 0) - (b.reviewCriteria?.length ?? 0),
};

/** A copy's title, kept inside the server's 200-character limit. */
function copyTitle(title: string): string {
  const suffix = " (copy)";
  return title.slice(0, 200 - suffix.length) + suffix;
}

type DeliverablesTabProps = {
  opportunityId: Id<"opportunities">;
  deliverables: Doc<"deliverables">[];
  /** The campaign's title, shown under each assignment's title as in Figma. */
  campaignTitle: string | undefined;
  rules: DeliverableRules;
  onAdd: () => void;
  onOpen: (deliverableId: Id<"deliverables">) => void;
  onEdit: (deliverableId: Id<"deliverables">) => void;
  /** Moves focus to this row's title, or to the Add button, when the list mounts. */
  focusTarget?: Id<"deliverables"> | "add";
};

/** The Assignments tab: the opportunity's deliverables, with add, open, edit, duplicate and delete. */
export function DeliverablesTab({
  opportunityId,
  deliverables,
  campaignTitle,
  rules,
  onAdd,
  onOpen,
  onEdit,
  focusTarget,
}: DeliverablesTabProps) {
  const [sort, setSort] = useState<Sort>({ key: "created", direction: "ascending" });
  const [deleting, setDeleting] = useState<Doc<"deliverables"> | null>(null);
  // The row being deleted, kept after the dialog closes so focus can return to it.
  const lastDeletingId = useRef<Id<"deliverables"> | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<Id<"deliverables"> | null>(null);
  const create = useMutation(api.deliverables.create);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!focusTarget) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-focus-target="${focusTarget}"]`)
      ?.focus({ preventScroll: false });
    // Only on mount: returning from a sub-view is the one time focus should move.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sorted = useMemo(() => {
    const compare = COMPARE[sort.key];
    const rows = [...deliverables].sort(compare);
    return sort.direction === "ascending" ? rows : rows.reverse();
  }, [deliverables, sort]);

  const sortBy = (key: SortKey) => () =>
    setSort((current) => ({
      key,
      direction:
        current.key === key && current.direction === "ascending" ? "descending" : "ascending",
    }));
  const sortOf = (key: SortKey) => (sort.key === key ? sort.direction : "unsorted");

  async function duplicate(deliverable: Doc<"deliverables">) {
    setDuplicatingId(deliverable._id);
    try {
      // Example media stays behind: the server only accepts files the caller uploaded.
      await create({
        opportunityId,
        title: copyTitle(deliverable.title),
        description: deliverable.description,
        ...(deliverable.reviewCriteria?.length
          ? { reviewCriteria: deliverable.reviewCriteria }
          : {}),
      });
      toast.success(`Duplicated “${deliverable.title}”.`);
    } catch (error) {
      toast.error(deliverableErrorMessage(error));
    } finally {
      setDuplicatingId(null);
    }
  }

  const addButton = (
    <Button
      size="sm"
      icon={RiAddLine}
      onClick={onAdd}
      disabled={!rules.canAdd}
      data-focus-target="add"
      aria-describedby={rules.canAdd ? undefined : "add-assignment-reason"}
    >
      Add New Assignment
    </Button>
  );

  return (
    <div ref={listRef} className="flex flex-col items-center gap-6">
      {!rules.canChange && rules.changeReason && deliverables.length > 0 ? (
        <Banner tone="neutral" icon={RiLockLine}>
          {rules.changeReason}
        </Banner>
      ) : null}

      {deliverables.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <p className="text-body-lg font-medium text-gray-950">No assignments yet</p>
          <p className="max-w-sm text-body text-gray-500">
            Assignments are the pieces of content every creator on this opportunity makes. Add one
            to describe what you need.
          </p>
          {addButton}
        </div>
      ) : (
        <>
          <TableCard title="Assignments" count={deliverables.length} className="self-stretch">
            <TableHeader>
              <TableHead sort={sortOf("title")} onSort={sortBy("title")}>
                Title
              </TableHead>
              <TableHead
                sort={sortOf("created")}
                onSort={sortBy("created")}
                className="w-20 sm:w-36"
              >
                <span className="max-sm:hidden">Date created</span>
                <span className="sm:hidden">Created</span>
              </TableHead>
              {/* Phones drop the criteria count; the details view lists them. */}
              <TableHead
                sort={sortOf("criteria")}
                onSort={sortBy("criteria")}
                className="w-36 max-sm:hidden"
              >
                Review criteria
              </TableHead>
              <TableHead className="w-9 sm:w-13">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableHeader>
            <TableBody>
              {sorted.map((deliverable) => (
                <TableRow key={deliverable._id}>
                  <TableCell type="custom">
                    <span className="contents max-sm:hidden">
                      <CompanyAvatar
                        size={32}
                        initials={deliverable.title.trim().charAt(0).toUpperCase()}
                      />
                    </span>
                    <button
                      type="button"
                      data-focus-target={deliverable._id}
                      onClick={() => onOpen(deliverable._id)}
                      className={cn(
                        "flex min-w-0 cursor-pointer flex-col rounded-xs text-left hover:underline",
                        focusRing,
                      )}
                    >
                      <span className="truncate font-medium">{deliverable.title}</span>
                      {campaignTitle ? (
                        <span className="truncate text-body-xs text-gray-500">{campaignTitle}</span>
                      ) : null}
                    </button>
                  </TableCell>
                  <TableCell>{formatModalDate(deliverable._creationTime)}</TableCell>
                  <TableCell className="max-sm:hidden">
                    {deliverable.reviewCriteria?.length ?? 0}
                  </TableCell>
                  <TableCell type="custom" className="text-right">
                    {duplicatingId === deliverable._id ? (
                      <Spinner size={16} label="Duplicating" />
                    ) : (
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              variant="secondary-subtle"
                              size="icon-sm"
                              aria-label={`Actions for ${deliverable.title}`}
                              data-menu-for={deliverable._id}
                            >
                              <RiMoreLine size={16} aria-hidden />
                            </Button>
                          }
                        />
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            icon={RiFileCopyLine}
                            disabled={!rules.canAdd}
                            onClick={() => void duplicate(deliverable)}
                          >
                            Duplicate
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            icon={RiPencilLine}
                            disabled={!rules.canChange}
                            onClick={() => onEdit(deliverable._id)}
                          >
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            icon={RiDeleteBinLine}
                            variant="destructive"
                            disabled={!rules.canRemove}
                            onClick={() => {
                              lastDeletingId.current = deliverable._id;
                              setDeleting(deliverable);
                            }}
                          >
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </TableCard>
          {addButton}
          {rules.canChange && !rules.canRemove && rules.removeReason ? (
            <p className="-mt-3 text-body-sm text-gray-500">{rules.removeReason}</p>
          ) : null}
        </>
      )}
      {!rules.canAdd && rules.addReason ? (
        <p id="add-assignment-reason" className="-mt-3 text-body-sm text-gray-500">
          {rules.addReason}
        </p>
      ) : null}

      <DeleteDeliverableDialog
        deliverable={deleting}
        onClose={() => setDeleting(null)}
        // Back to the row's menu button, or to Add once the row is gone.
        finalFocus={() =>
          listRef.current?.querySelector<HTMLElement>(
            `[data-menu-for="${lastDeletingId.current}"], [data-focus-target="add"]`,
          ) ?? true
        }
      />
    </div>
  );
}

/** Confirms deleting an assignment. Closed when `deliverable` is null. */
function DeleteDeliverableDialog({
  deliverable,
  onClose,
  finalFocus,
}: {
  deliverable: Doc<"deliverables"> | null;
  onClose: () => void;
  finalFocus: ComponentProps<typeof Modal>["finalFocus"];
}) {
  const remove = useMutation(api.deliverables.remove);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Keeps the title on screen while the dialog animates out.
  const [shown, setShown] = useState(deliverable);
  if (deliverable && deliverable !== shown) setShown(deliverable);

  async function confirm() {
    if (!deliverable) return;
    setPending(true);
    setError(null);
    try {
      await remove({ deliverableId: deliverable._id });
      toast.success(`Deleted “${deliverable.title}”.`);
      onClose();
    } catch (caught) {
      setError(deliverableErrorMessage(caught));
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal
      open={deliverable !== null}
      onOpenChange={(open) => {
        if (!open && !pending) {
          setError(null);
          onClose();
        }
      }}
      title={`Delete “${shown?.title ?? ""}”?`}
      finalFocus={finalFocus}
      // Nested dialogs skip the backdrop, so a shadow lifts it off the modal below.
      className="shadow-overlay sm:max-w-md"
      footer={
        <>
          <Button variant="secondary-ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button variant="destructive-subtle" onClick={() => void confirm()} disabled={pending}>
            {pending ? <Spinner size={16} label="Deleting" className="text-current" /> : null}
            Delete assignment
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-body text-gray-700">
          Creators won&apos;t see it, and it can&apos;t be restored. No creator has joined yet, so
          nobody&apos;s work is affected.
        </p>
        {error ? (
          <p role="alert" className="text-body-sm text-red-600">
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
