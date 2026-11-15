"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useAction, useConvex, useQueries } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { RiTwitterXLine } from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/errors";
import {
  hasPendingXStart,
  readXLinkResult,
  startXLinkOnce,
  subscribeXStarts,
  withXLinkTimeout,
  xAuthorizationUrl,
  xLinkResultMessage,
  XLinkTimeoutError,
} from "../lib/x-link";

type Account = FunctionReturnType<typeof api.xAccounts.me>;
type Attempt = { tab: Window; expiresAt: number; baseline: Account };
const ACCOUNT_QUERY = { account: { query: api.xAccounts.me, args: {} } };

function connectionChanged(account: Account | undefined, baseline: Account) {
  return (
    account?.status === "connected" &&
    (!baseline ||
      account.xAccountId !== baseline.xAccountId ||
      account.updatedAt !== baseline.updatedAt)
  );
}

/** X saves independently; the authorization tab leaves the profile draft in place. */
export function ProfileXConnection({
  creatorId,
  disabled = false,
}: {
  creatorId: Id<"creators">;
  disabled?: boolean;
}) {
  const { account: result }: { account?: Account | Error } = useQueries(ACCOUNT_QUERY);
  const client = useConvex();
  const startLink = useAction(api.xAccounts.start);
  const pendingStart = useSyncExternalStore(
    subscribeXStarts,
    () => hasPendingXStart(client, creatorId),
    () => false,
  );
  const observation = useMemo(() => ({ result }), [result]);
  const [checked, setChecked] = useState<{ account: Account; observation: typeof observation }>();
  // A current client read can precede a hook render; the next subscription update supersedes it.
  const account =
    checked?.observation === observation
      ? checked.account
      : result instanceof Error
        ? undefined
        : result;
  const queryFailed = result instanceof Error && checked?.observation !== observation;
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [phase, setPhase] = useState<"idle" | "opening" | "waiting" | "checking">("idle");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const starting = useRef(false);
  const checking = useRef(false);
  const mounted = useRef(true);
  const operationId = useRef(0);
  const completed = attempt !== null && connectionChanged(account, attempt.baseline);
  const waiting = phase === "waiting" && !completed;
  const busy = phase === "opening" || phase === "checking" || waiting || pendingStart;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      operationId.current += 1;
    };
  }, []);

  useEffect(() => {
    if (phase !== "opening") return;
    const timeout = window.setTimeout(() => {
      setNotice("X is taking longer than expected. You can keep editing while we wait.");
    }, 20_000);
    return () => window.clearTimeout(timeout);
  }, [phase]);

  useEffect(() => {
    if (!waiting || !attempt) return;
    const interval = window.setInterval(() => {
      const outcome = readXLinkResult(attempt.tab, window.location.origin);
      if (outcome) {
        setPhase("idle");
        if (outcome === "connected") setNotice(xLinkResultMessage(outcome));
        else setError(xLinkResultMessage(outcome));
        attempt.tab.close();
      } else if (Date.now() >= attempt.expiresAt) {
        setPhase("idle");
        setError("The X connection attempt expired. Check your connection, then try again.");
      } else if (attempt.tab.closed) {
        // Some providers detach the tab via COOP; a closed handle is not a failed grant.
        setPhase("idle");
        setNotice("");
      }
    }, 500);
    return () => window.clearInterval(interval);
  }, [attempt, waiting]);

  async function checkConnection() {
    if (checking.current || disabled || phase === "opening") return;
    checking.current = true;
    const operation = ++operationId.current;
    setPhase("checking");
    setError("");
    try {
      const current = await withXLinkTimeout(client.query(api.xAccounts.me, {}));
      if (!mounted.current || operationId.current !== operation) return;
      setChecked({ account: current, observation });
      if (
        current?.status === "connected" &&
        (!attempt || connectionChanged(current, attempt.baseline))
      ) {
        setNotice("");
      } else {
        setNotice("");
        setError(
          current?.status === "reconnect_required"
            ? "Your X account needs to be reconnected. Try again."
            : "No new X connection was confirmed. Finish authorization or try again.",
        );
      }
    } catch (cause) {
      if (mounted.current && operationId.current === operation) {
        setError(
          cause instanceof XLinkTimeoutError
            ? "X did not respond in time. Check your connection, then try again."
            : errorMessage(cause),
        );
      }
    } finally {
      checking.current = false;
      if (mounted.current && operationId.current === operation) setPhase("idle");
    }
  }

  async function connect() {
    if (
      starting.current ||
      hasPendingXStart(client, creatorId) ||
      disabled ||
      busy ||
      account === undefined
    )
      return;
    let tab: Window | null;
    try {
      tab = window.open("about:blank", "_blank");
    } catch {
      tab = null;
    }
    if (!tab) {
      setError("Allow pop-ups to connect X, then try again.");
      return;
    }
    // Preserve this handle for status checks without giving the provider access to our page.
    tab.opener = null;
    tab.document.title = "Connecting X";
    tab.document.body.textContent = "Opening X… You can return to your profile while you wait.";
    starting.current = true;
    const operation = ++operationId.current;
    setPhase("opening");
    setAttempt(null);
    setError("");
    setNotice("");
    try {
      // Reconcile before a new attempt, which invalidates earlier authorizations on the server.
      const baseline = await withXLinkTimeout(client.query(api.xAccounts.me, {}));
      if (!mounted.current || operationId.current !== operation || tab.closed) {
        tab.close();
        if (mounted.current && operationId.current === operation) {
          setPhase("idle");
          setNotice("The X tab was closed. You can try again.");
        }
        return;
      }
      if (
        baseline?.status === "connected" &&
        (account?.status !== "connected" || connectionChanged(baseline, account))
      ) {
        tab.close();
        setChecked({ account: baseline, observation });
        setPhase("idle");
        return;
      }
      const grant = await withXLinkTimeout(startXLinkOnce(client, creatorId, () => startLink({})));
      if (!mounted.current || operationId.current !== operation || tab.closed) {
        tab.close();
        if (mounted.current && operationId.current === operation) {
          setPhase("idle");
          setNotice("The X tab was closed. You can try again.");
        }
        return;
      }
      if (!Number.isFinite(grant.expiresAt) || grant.expiresAt <= Date.now()) {
        throw new Error("Expired X authorization");
      }
      tab.location.replace(xAuthorizationUrl(grant.authorizationUrl));
      setAttempt({ tab, expiresAt: grant.expiresAt, baseline });
      setChecked({ account: baseline, observation });
      setPhase("waiting");
    } catch (cause) {
      tab.close();
      if (mounted.current && operationId.current === operation) {
        setError(
          cause instanceof XLinkTimeoutError
            ? "X did not respond in time. Check your connection, then try again."
            : errorMessage(cause),
        );
        setPhase("idle");
      }
    } finally {
      starting.current = false;
    }
  }

  const message = completed
    ? `@${account?.username} connected`
    : waiting
      ? "Finish authorization in the X tab, then return here."
      : notice ||
        (!attempt && account?.status === "connected" ? `@${account.username} connected` : "");
  const visibleError = completed ? "" : error || (queryFailed ? errorMessage(result) : "");

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="secondary-subtle"
          size="sm"
          icon={RiTwitterXLine}
          disabled={disabled || busy || account === undefined}
          onClick={() => void connect()}
        >
          {phase === "opening"
            ? "Opening X…"
            : phase === "checking"
              ? "Checking X…"
              : pendingStart
                ? "Waiting for X…"
                : waiting
                  ? "Connecting to X…"
                  : account
                    ? "Reconnect X"
                    : "Link X"}
        </Button>
        {(attempt || error || queryFailed || pendingStart) && (
          <Button
            type="button"
            variant="secondary-ghost"
            size="sm"
            disabled={disabled || phase === "opening" || phase === "checking"}
            onClick={() => void checkConnection()}
          >
            Check connection
          </Button>
        )}
      </div>
      {pendingStart && phase !== "opening" && (
        <p role="status" className="text-body-sm text-gray-700">
          An X request is still finishing. You can keep editing or check your connection.
        </p>
      )}
      {account === undefined && !(result instanceof Error) && (
        <p role="status" className="text-body-sm text-gray-500">
          Loading X connection…
        </p>
      )}
      {message && (
        <p role="status" className="text-body-sm text-gray-700">
          {message}
        </p>
      )}
      {account?.status === "reconnect_required" && !waiting && (
        <p className="text-body-sm text-gray-700">
          Reconnect @{account.username} to restore access.
        </p>
      )}
      {visibleError && (
        <p role="alert" className="text-body-sm text-red-700">
          {visibleError}
        </p>
      )}
    </div>
  );
}
