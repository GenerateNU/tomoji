"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { errorMessage, errorReason } from "@/lib/errors";

type Response = "accept" | "decline";

const REASON_MESSAGES: Record<string, string> = {
  offer_expired: "This offer expired before you accepted it.",
  opportunity_full: "All spots on this opportunity were just taken.",
  opportunity_closed: "This opportunity has closed.",
  application_not_offered: "This offer is no longer open.",
  terms_not_accepted: "Please review and accept the terms and conditions first.",
};

function failureMessage(error: unknown): string {
  const reason = errorReason(error);
  if (reason !== null && reason in REASON_MESSAGES) return REASON_MESSAGES[reason];
  return errorMessage(error, {
    not_found: "This offer is no longer available.",
    conflict: "You're already assigned to this opportunity.",
  });
}

/**
 * Accepting or declining one offer. Each returns whether it worked; the offer
 * updates by itself when the mutation lands, so callers only need `pending` to
 * block a second tap while one is in flight.
 */
export function useOfferResponse(applicationId: Id<"applications">) {
  const acceptOffer = useMutation(api.applications.accept);
  const declineOffer = useMutation(api.applications.decline);
  const router = useRouter();
  const [pending, setPending] = useState<Response | null>(null);

  async function accept(options: { acceptedTerms?: boolean } = {}): Promise<boolean> {
    setPending("accept");
    try {
      const { assignmentId } = await acceptOffer({ applicationId, ...options });
      toast.success("Offer accepted.", {
        action: {
          label: "View assignment",
          onClick: () => router.push(`/assignments/${assignmentId}`),
        },
      });
      return true;
    } catch (error) {
      toast.error(failureMessage(error));
      return false;
    } finally {
      setPending(null);
    }
  }

  async function decline(): Promise<boolean> {
    setPending("decline");
    try {
      await declineOffer({ applicationId });
      toast.success("Offer declined.");
      return true;
    } catch (error) {
      toast.error(failureMessage(error));
      return false;
    } finally {
      setPending(null);
    }
  }

  return { pending, accept, decline };
}
