"use client";

import { useRef, useState } from "react";
import { useAction, usePaginatedQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/features/auth/components/form-alert";
import { invitationError } from "@/features/team/lib/invitation-errors";

/** Shows admin-only invitations, leaving removal to the WorkOS webhook. */
export function PendingInvitations() {
  const { results, status, loadMore } = usePaginatedQuery(
    api.invites.listMine,
    {},
    { initialNumItems: 20 },
  );
  const revoke = useAction(api.invites.revokeMine);
  const [confirm, setConfirm] = useState<Id<"invites"> | null>(null);
  const [pending, setPending] = useState<Id<"invites"> | null>(null);
  const [requested, setRequested] = useState(() => new Set<Id<"invites">>());
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  /** Records an acknowledged cancellation without optimistically deleting its row. */
  async function cancel(inviteId: Id<"invites">) {
    if (inFlight.current || requested.has(inviteId)) return;
    inFlight.current = true;
    setPending(inviteId);
    setError(null);
    try {
      await revoke({ inviteId });
      setRequested((previous) => new Set(previous).add(inviteId));
      setConfirm(null);
      toast.success("Cancellation requested.");
    } catch (error) {
      setError(invitationError(error, "cancel"));
    } finally {
      inFlight.current = false;
      setPending(null);
    }
  }

  return (
    <section aria-label="Pending invitations" className="space-y-4">
      <h2 className="text-xl font-semibold">Pending invitations</h2>
      <FormAlert message={error} />
      {status === "LoadingFirstPage" ? (
        <p role="status">Loading pending invitations…</p>
      ) : results.length === 0 ? (
        <p className="text-muted-foreground">No pending invitations.</p>
      ) : (
        <ul className="divide-y rounded-xl border px-5">
          {results.map((invite) => (
            <li key={invite._id} className="space-y-3 py-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="break-all font-medium">{invite.email}</p>
                  <p className="text-sm text-muted-foreground">
                    {invite.role === "admin" ? "Admin" : "Member"} · Expires{" "}
                    {new Date(invite.expiresAt).toLocaleDateString("en-US")}
                  </p>
                </div>
                {requested.has(invite._id) ? (
                  <p className="text-sm text-muted-foreground">Cancellation requested</p>
                ) : (
                  confirm !== invite._id && (
                    <Button
                      variant="secondary"
                      className="min-h-11"
                      disabled={pending !== null}
                      onClick={() => {
                        setConfirm(invite._id);
                        setError(null);
                      }}
                    >
                      Cancel invitation
                    </Button>
                  )
                )}
              </div>
              {confirm === invite._id && (
                <div className="space-y-3 rounded-lg bg-muted p-4">
                  <p className="break-all text-sm">Cancel the invitation for {invite.email}?</p>
                  <div className="flex flex-wrap gap-3">
                    <Button
                      tone="destructive"
                      className="min-h-11"
                      disabled={pending !== null}
                      onClick={() => void cancel(invite._id)}
                    >
                      {pending === invite._id ? "Cancelling…" : "Confirm cancellation"}
                    </Button>
                    <Button
                      variant="secondary"
                      className="min-h-11"
                      disabled={pending !== null}
                      onClick={() => {
                        setConfirm(null);
                        setError(null);
                      }}
                    >
                      Keep invitation
                    </Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {(status === "CanLoadMore" || status === "LoadingMore") && (
        <Button
          variant="secondary"
          className="min-h-11"
          disabled={status === "LoadingMore"}
          onClick={() => loadMore(20)}
        >
          {status === "LoadingMore" ? "Loading more…" : "Load more invitations"}
        </Button>
      )}
    </section>
  );
}
