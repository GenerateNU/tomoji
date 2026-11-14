"use client";

import { api } from "@convex/_generated/api";
import type { Doc } from "@convex/_generated/dataModel";
import {
  RiCloseCircleLine,
  RiDeleteBinLine,
  RiMoreFill,
  RiPauseCircleLine,
  RiPencilLine,
  RiPlayCircleLine,
} from "@remixicon/react";
import { useMutation } from "convex/react";
import { useState } from "react";
import { Modal } from "@/components/modal";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { errorMessage } from "@/lib/errors";
import {
  campaignFormValues,
  parseCampaignForm,
  type CampaignFormValues,
} from "../lib/campaign-form";
import { CampaignFields } from "./campaign-fields";

type Action = "edit" | "pause" | "resume" | "publish" | "end" | "cancel";

/** What each confirmation says and which backend change it makes. */
const CONFIRMATIONS = {
  pause: {
    question: "pause",
    detail:
      "This will pause all of its open opportunities. Applications and assignments stay as they are.",
    destructive: false,
  },
  resume: {
    question: "resume",
    detail: "Creators can see it again. Opportunities you paused one by one stay paused.",
    destructive: false,
  },
  publish: {
    question: "launch",
    detail: "Creators can see its open opportunities once it's live.",
    destructive: false,
  },
  end: {
    question: "end",
    detail: "This closes the campaign for good. Existing assignments keep their terms.",
    destructive: true,
  },
  cancel: {
    question: "delete",
    detail: "This removes the draft. It can't be undone.",
    destructive: true,
  },
} as const;

function EditCampaignModal({
  campaign,
  open,
  onOpenChange,
}: {
  campaign: Doc<"campaigns">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const update = useMutation(api.campaigns.update);
  const [values, setValues] = useState<CampaignFormValues>(() => campaignFormValues(campaign));
  const [errors, setErrors] = useState<Partial<Record<keyof CampaignFormValues, string>>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const parsed = parseCampaignForm(values);
    if (parsed.errors) {
      setErrors(parsed.errors);
      return;
    }
    setErrors({});
    setSaving(true);
    setError(null);
    try {
      const { endsAt, ...rest } = parsed.input;
      await update({ campaignId: campaign._id, ...rest, endsAt: endsAt ?? null });
      onOpenChange(false);
    } catch (caught) {
      setError(
        errorMessage(caught, {
          invalid_state:
            "Those dates don't work. The end can't be before an opportunity's deadline or in the past.",
          forbidden: "Only company admins can edit campaigns.",
        }),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={
        <span className="flex flex-col gap-1">
          Edit Campaign
          <span className="text-body-sm font-normal text-gray-500">{campaign.title}</span>
        </span>
      }
      className="sm:max-w-2xl"
      footer={
        <>
          <Button variant="secondary-ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </>
      }
    >
      <CampaignFields
        values={values}
        errors={errors}
        onChange={(changes) => setValues((current) => ({ ...current, ...changes }))}
      />
      {error && (
        <p role="alert" className="mt-4 text-body-sm text-red-600">
          {error}
        </p>
      )}
    </Modal>
  );
}

/**
 * The "…" menu on a campaign card: edit, and the status changes the campaign's
 * status allows. Each status change asks for confirmation first. Editing and
 * deleting a draft are admin-only, like their backend routes.
 */
export function CampaignActions({
  campaign,
  isAdmin,
}: {
  campaign: Doc<"campaigns">;
  isAdmin: boolean;
}) {
  const pause = useMutation(api.campaigns.pause);
  const resume = useMutation(api.campaigns.resume);
  const publish = useMutation(api.campaigns.publish);
  const close = useMutation(api.campaigns.close);
  const remove = useMutation(api.campaigns.remove);
  const [action, setAction] = useState<Action | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (campaign.status === "closed") return null;
  const confirming = action !== null && action !== "edit" ? CONFIRMATIONS[action] : null;

  async function confirm() {
    if (action === null || action === "edit") return;
    setPending(true);
    setError(null);
    const campaignId = campaign._id;
    try {
      if (action === "pause") await pause({ campaignId });
      if (action === "resume") await resume({ campaignId });
      if (action === "publish") await publish({ campaignId });
      if (action === "end") await close({ campaignId });
      if (action === "cancel") await remove({ campaignId });
      setAction(null);
    } catch (caught) {
      setError(
        errorMessage(caught, {
          invalid_state:
            action === "cancel"
              ? "Only drafts without opportunities can be deleted."
              : "This campaign can't change right now. Check its dates and try again.",
        }),
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="secondary-ghost"
              size="icon-sm"
              aria-label={`Actions for ${campaign.title}`}
            />
          }
        >
          <RiMoreFill aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {isAdmin && (
            <DropdownMenuItem icon={RiPencilLine} onClick={() => setAction("edit")}>
              Edit Campaign
            </DropdownMenuItem>
          )}
          {campaign.status === "open" && (
            <DropdownMenuItem icon={RiPauseCircleLine} onClick={() => setAction("pause")}>
              Pause Campaign
            </DropdownMenuItem>
          )}
          {campaign.status === "paused" && (
            <DropdownMenuItem icon={RiPlayCircleLine} onClick={() => setAction("resume")}>
              Resume Campaign
            </DropdownMenuItem>
          )}
          {campaign.status === "draft" && (
            <DropdownMenuItem icon={RiPlayCircleLine} onClick={() => setAction("publish")}>
              Launch Campaign
            </DropdownMenuItem>
          )}
          {(campaign.status !== "draft" || isAdmin) && <DropdownMenuSeparator />}
          {campaign.status !== "draft" ? (
            <DropdownMenuItem
              variant="destructive"
              icon={RiCloseCircleLine}
              onClick={() => setAction("end")}
            >
              End Campaign
            </DropdownMenuItem>
          ) : (
            isAdmin && (
              <DropdownMenuItem
                variant="destructive"
                icon={RiDeleteBinLine}
                onClick={() => setAction("cancel")}
              >
                Delete Draft
              </DropdownMenuItem>
            )
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {action === "edit" && (
        <EditCampaignModal
          campaign={campaign}
          open
          onOpenChange={(open) => !open && setAction(null)}
        />
      )}
      {confirming && (
        <Modal
          open
          onOpenChange={(open) => {
            if (!open && !pending) {
              setAction(null);
              setError(null);
            }
          }}
          title={`Are you sure you want to ${confirming.question} the campaign for ${campaign.title}?`}
          className="sm:max-w-md"
          footer={
            <>
              <Button variant="secondary-ghost" onClick={() => setAction(null)} disabled={pending}>
                Cancel
              </Button>
              <Button
                variant={confirming.destructive ? "destructive-subtle" : "secondary"}
                onClick={confirm}
                disabled={pending}
              >
                {pending ? "Working…" : "Yes"}
              </Button>
            </>
          }
        >
          <p className="text-body-sm text-gray-500">{confirming.detail}</p>
          {error && (
            <p role="alert" className="mt-3 text-body-sm text-red-600">
              {error}
            </p>
          )}
        </Modal>
      )}
    </>
  );
}
