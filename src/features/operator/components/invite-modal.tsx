"use client";

import { api } from "@convex/_generated/api";
import { useAction } from "convex/react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Modal } from "@/components/modal";
import { SelectField } from "@/components/select-field";
import { TextField } from "@/components/text-field";
import { Button } from "@/components/ui/button";
import { SegmentedControl, Segment } from "@/components/ui/segmented-control";
import { FormAlert } from "@/features/auth/components/form-alert";
import { email as emailRule, required, validateField } from "@/features/auth/lib/form";
import { invitationError } from "@/features/team/lib/invitation-errors";
import { CompanyPicker } from "./company-picker";
import type { DirectoryCompany } from "../lib/labels";

/**
 * Which invitations this modal can send. "creator" and "companyUser" are
 * offered from Users; "company" is offered from Companies, because it also
 * creates the WorkOS organization and the `companies` row.
 */
export type InviteKind = "creator" | "companyUser" | "company";

type Draft = {
  email: string;
  companyName: string;
  company: DirectoryCompany | null;
  role: "admin" | "member";
};

const EMPTY: Draft = { email: "", companyName: "", company: null, role: "admin" };

const COPY = {
  creator: { title: "Invite a creator" },
  companyUser: { title: "Invite a company user" },
  company: {
    title: "Invite a company",
    // Kept because this kind creates a WorkOS organization the operator cannot undo.
    description:
      "Creates the company and its WorkOS organization, then invites this person as its first admin.",
  },
} as const;

/**
 * Sends one WorkOS invitation. `kinds` sets which kinds the operator may pick;
 * with one kind the switcher is hidden.
 *
 * `invites.inviteCompany` is not safe to retry — it creates an organization
 * before sending — so the submit button is locked for the whole round trip and
 * a failure reports the company it already made.
 */
export function InviteModal({
  open,
  onOpenChange,
  kinds,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kinds: readonly InviteKind[];
}) {
  const inviteCreator = useAction(api.invites.inviteCreator);
  const inviteCompany = useAction(api.invites.inviteCompany);
  const inviteCompanyUser = useAction(api.invites.inviteCompanyUser);

  const [kind, setKind] = useState<InviteKind>(kinds[0]);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof Draft, string>>>({});
  const inFlight = useRef(false);

  function reset() {
    setDraft(EMPTY);
    setError(null);
    setFieldErrors({});
  }

  function close() {
    if (inFlight.current) return;
    onOpenChange(false);
    reset();
  }

  function validate(): boolean {
    const problems: Partial<Record<keyof Draft, string>> = {};
    const emailProblem = validateField("email", draft.email, [
      required("Email required"),
      emailRule(),
    ]);
    if (emailProblem) problems.email = emailProblem;
    if (kind === "company" && draft.companyName.trim() === "") {
      problems.companyName = "Company name required";
    }
    if (kind === "companyUser" && draft.company === null) {
      problems.company = "Pick a company";
    }
    setFieldErrors(problems);
    return Object.keys(problems).length === 0;
  }

  async function send() {
    if (inFlight.current || !validate()) return;
    inFlight.current = true;
    setPending(true);
    setError(null);
    const address = draft.email.trim();
    try {
      if (kind === "creator") {
        await inviteCreator({ email: address });
      } else if (kind === "company") {
        await inviteCompany({ companyName: draft.companyName.trim(), email: address });
      } else if (draft.company) {
        await inviteCompanyUser({
          companyId: draft.company._id,
          email: address,
          role: draft.role,
        });
      }
      toast.success(`Invitation sent to ${address}.`);
      onOpenChange(false);
      reset();
    } catch (failure) {
      setError(
        kind === "company" && hasCompanyCreated(failure)
          ? `${draft.companyName.trim()} was created, but the invitation didn't send. Invite its admin from the Companies list instead of sending this again.`
          : invitationError(failure, "send"),
      );
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  const copy = COPY[kind];
  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
      title={copy.title}
      className="sm:max-w-[32rem]"
      footer={
        <>
          <Button variant="secondary-subtle" disabled={pending} onClick={close}>
            Cancel
          </Button>
          <Button disabled={pending} onClick={() => void send()}>
            {pending ? "Sending…" : "Send invitation"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {"description" in copy && <p className="text-body-sm text-gray-500">{copy.description}</p>}

        {kinds.length > 1 && (
          <SegmentedControl
            aria-label="Invitation type"
            value={kind}
            onChange={(next: string) => {
              setKind(next as InviteKind);
              setFieldErrors({});
              setError(null);
            }}
          >
            {kinds.map((option) => (
              <Segment
                key={option}
                value={option}
                label={option === "creator" ? "Creator" : "Company user"}
              />
            ))}
          </SegmentedControl>
        )}

        {kind === "company" && (
          <TextField
            label="Company name"
            required
            placeholder="Northstar Studio"
            value={draft.companyName}
            error={fieldErrors.companyName}
            onChange={(event) => setDraft({ ...draft, companyName: event.target.value })}
          />
        )}

        {kind === "companyUser" && (
          <>
            <CompanyPicker
              value={draft.company}
              onValueChange={(company) => setDraft({ ...draft, company })}
              error={fieldErrors.company}
            />
            <SelectField
              label="Role"
              options={[
                { value: "admin", label: "Admin" },
                { value: "member", label: "Member" },
              ]}
              value={draft.role}
              onValueChange={(role) =>
                setDraft({ ...draft, role: role === "member" ? "member" : "admin" })
              }
            />
          </>
        )}

        <TextField
          label="Email"
          type="email"
          required
          autoComplete="off"
          placeholder="name@example.com"
          value={draft.email}
          error={fieldErrors.email}
          onChange={(event) => setDraft({ ...draft, email: event.target.value })}
        />

        <FormAlert message={error} />
      </div>
    </Modal>
  );
}

/** `inviteCompany` reports the company it made when only the invitation failed. */
function hasCompanyCreated(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("data" in error)) return false;
  const data = (error as { data: unknown }).data;
  return typeof data === "object" && data !== null && "companyCreated" in data;
}
