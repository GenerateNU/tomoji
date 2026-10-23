"use client";

import { useRef, useState, type FormEvent } from "react";
import { useAction, usePaginatedQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { FormField } from "@/features/auth/components/form-field";
import { email, validateField } from "@/features/auth/lib/form";
import { errorMessage } from "@/lib/errors";

/** Manages outstanding invitations for the current company's admins, not existing memberships. */
export function TeammateInvites() {
  const { results, status, loadMore } = usePaginatedQuery(
    api.invites.listMine,
    {},
    { initialNumItems: 20 },
  );
  const invite = useAction(api.invites.inviteTeammate);
  const revoke = useAction(api.invites.revokeMine);
  const [address, setAddress] = useState("");
  const [role, setRole] = useState<NonNullable<Doc<"invites">["role"]>>("member");
  const [pending, setPending] = useState<"invite" | Id<"invites"> | null>(null);
  const [confirm, setConfirm] = useState<Id<"invites"> | null>(null);
  const [requested, setRequested] = useState(new Set<Id<"invites">>());
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const inFlight = useRef(false);

  /** Sends each deliberate action once and waits for webhook-backed query updates. */
  async function run(id: "invite" | Id<"invites">) {
    if (inFlight.current) return;
    if (id === "invite") {
      const problem = validateField("email", address, [email()]);
      if (problem) {
        setError(problem);
        return;
      }
    }
    inFlight.current = true;
    setPending(id);
    setError(null);
    setNotice("");
    try {
      if (id === "invite") {
        await invite({ email: address.trim(), role });
        setAddress("");
        setNotice("Invitation sent. The pending list will update after WorkOS syncs.");
      } else {
        await revoke({ inviteId: id });
        setRequested((previous) => new Set(previous).add(id));
        setConfirm(null);
        setNotice("Cancellation requested. The invitation will disappear after WorkOS confirms.");
      }
    } catch (error) {
      setError(
        errorMessage(error, {
          conflict:
            id === "invite"
              ? "That email already has a pending invitation."
              : "This invitation changed. Check the pending list before trying again.",
          upstream_failure:
            "We couldn't confirm the result. Check pending invitations before trying again.",
        }),
      );
    } finally {
      inFlight.current = false;
      setPending(null);
    }
  }

  /** Prevents a native form navigation while preserving browser email validation. */
  function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run("invite");
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8 px-5 py-10 sm:px-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">Invite teammates</h1>
        <p className="text-muted-foreground">Add members to manage your campaigns.</p>
      </header>
      <form onSubmit={send} className="space-y-5 rounded-xl border p-5 sm:p-7">
        <fieldset disabled={pending !== null} className="space-y-5">
          <legend className="mb-4 text-lg font-semibold">Select role</legend>
          <div className="flex flex-wrap gap-6">
            {(["member", "admin"] as const).map((value) => (
              <label
                key={value}
                className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-5 has-checked:bg-muted"
              >
                <input
                  type="radio"
                  name="role"
                  value={value}
                  checked={role === value}
                  onChange={() => setRole(value)}
                />
                {value === "admin" ? "Admin" : "Member"}
              </label>
            ))}
          </div>
          <FormField
            label="Email"
            type="email"
            required
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            autoComplete="email"
            hint="Invite one teammate at a time."
            className="min-h-11"
          />
          <Button type="submit" className="min-h-11">
            {pending === "invite" ? "Sending…" : "Send invitation"}
          </Button>
        </fieldset>
      </form>
      <p role="status" className="text-sm text-muted-foreground">
        {notice}
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <section aria-label="Pending invitations" className="space-y-4">
        <h2 className="text-xl font-semibold">Pending invitations</h2>
        {status === "LoadingFirstPage" ? (
          <p>Loading pending invitations…</p>
        ) : results.length === 0 ? (
          <p className="text-muted-foreground">No pending invitations</p>
        ) : (
          <ul className="divide-y rounded-xl border px-5">
            {results.map((item) => (
              <li key={item._id} className="space-y-3 py-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-all font-medium">{item.email}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {item.role === "admin" ? "Admin" : "Member"} · Expires{" "}
                      {new Date(item.expiresAt).toLocaleDateString("en-US")}
                    </p>
                  </div>
                  {requested.has(item._id) ? (
                    <p className="text-sm text-muted-foreground">Cancellation requested</p>
                  ) : (
                    confirm !== item._id && (
                      <Button
                        variant="outline"
                        className="min-h-11"
                        disabled={pending !== null}
                        onClick={() => setConfirm(item._id)}
                      >
                        Cancel invitation
                      </Button>
                    )
                  )}
                </div>
                {confirm === item._id && (
                  <div className="space-y-3 rounded-lg bg-muted p-4">
                    <p className="text-sm">Cancel the invitation for {item.email}?</p>
                    <div className="flex flex-wrap gap-3">
                      <Button
                        variant="destructive"
                        className="min-h-11"
                        disabled={pending !== null}
                        onClick={() => void run(item._id)}
                      >
                        {pending === item._id ? "Cancelling…" : "Confirm cancellation"}
                      </Button>
                      <Button
                        variant="outline"
                        className="min-h-11"
                        disabled={pending !== null}
                        onClick={() => setConfirm(null)}
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
            variant="outline"
            className="min-h-11"
            disabled={status === "LoadingMore"}
            onClick={() => loadMore(20)}
          >
            {status === "LoadingMore" ? "Loading more…" : "Load more"}
          </Button>
        )}
      </section>
    </div>
  );
}
