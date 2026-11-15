"use client";

import { useState } from "react";
import { useNow } from "@/hooks/use-now";
import type { ApplicationStatus } from "../lib/application-status";
import { offerTiming } from "../lib/offer";

/**
 * The offer modal's clock: every minute normally, every second once the offer
 * is urgent and shows a live countdown.
 */
export function useOfferClock(
  status: ApplicationStatus | undefined,
  offerExpiresAt: number | undefined,
): number {
  const [fast, setFast] = useState(false);
  const now = useNow(fast ? 1000 : 60_000);
  const urgent = status !== undefined && offerTiming(status, offerExpiresAt, now) === "urgent";
  if (urgent !== fast) setFast(urgent);
  return now;
}
