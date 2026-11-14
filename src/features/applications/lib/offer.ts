import type { ApplicationStatus } from "./application-status";
import { formatOfferDeadline } from "./format";

/** An offer with less than this left reads as urgent. */
export const OFFER_URGENT_MS = 24 * 60 * 60 * 1000;

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export type OfferTiming = "live" | "urgent" | "expired" | "declined" | "accepted" | "none";

/**
 * Where an offer stands. The server can't read the clock in a query, and the
 * expiry cron runs every half hour, so an `offered` application past its
 * deadline counts as expired here.
 */
export function offerTiming(
  status: ApplicationStatus,
  offerExpiresAt: number | undefined,
  now: number,
): OfferTiming {
  switch (status) {
    case "declined":
      return "declined";
    case "accepted":
      return "accepted";
    case "offerExpired":
      return "expired";
    case "offered":
      if (offerExpiresAt === undefined) return "live";
      if (offerExpiresAt <= now) return "expired";
      return offerExpiresAt - now < OFFER_URGENT_MS ? "urgent" : "live";
    default:
      return "none";
  }
}

const relative = new Intl.RelativeTimeFormat("en", { numeric: "always" });

/** "in 12 days", "in 18 hours", "Expired" or "Declined": the Expiration date cell. */
export function formatOfferExpiry(
  status: ApplicationStatus,
  offerExpiresAt: number | undefined,
  now: number,
): string {
  const timing = offerTiming(status, offerExpiresAt, now);
  if (timing === "declined") return "Declined";
  if (timing === "expired") return "Expired";
  if (offerExpiresAt === undefined) return "–";
  const remaining = offerExpiresAt - now;
  // Rounds up, so an offer never reads as gone before it is.
  if (remaining < HOUR)
    return relative.format(Math.max(1, Math.ceil(remaining / MINUTE)), "minute");
  if (remaining < DAY) return relative.format(Math.floor(remaining / HOUR), "hour");
  return relative.format(Math.floor(remaining / DAY), "day");
}

export type OfferTag = {
  label: string;
  tone: "neutral" | "primary" | "destructive";
  /** The label is a live countdown, so the modal renders it as a timer. */
  countdown?: boolean;
};

/** Milliseconds as zero-padded HH:MM:SS, rounded up so it never reads 00:00:00 before the deadline. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}

/**
 * A review policy as a list: one item per line, with any leading "1.", "2)",
 * "-", "*" or bullet removed.
 */
export function reviewPolicyItems(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim().replace(/^(\d+[.)]|[-*•])\s+/, ""))
    .filter((line) => line !== "");
}

/** The tag beside the offer's title in its modal, or null when there is nothing to say. */
export function offerStatusTag(
  status: ApplicationStatus,
  offerExpiresAt: number | undefined,
  now: number,
): OfferTag | null {
  const timing = offerTiming(status, offerExpiresAt, now);
  switch (timing) {
    case "declined":
      return { label: "Offer declined", tone: "neutral" };
    case "accepted":
      return { label: "Offer accepted", tone: "primary" };
    case "expired":
      return {
        label:
          offerExpiresAt === undefined
            ? "Offer expired"
            : `Offer expired ${formatOfferDeadline(offerExpiresAt)}`,
        tone: "destructive",
      };
    case "urgent":
      return {
        label: `Offer expires in ${formatCountdown((offerExpiresAt ?? now) - now)}`,
        tone: "destructive",
        countdown: true,
      };
    case "live":
      return null;
    default:
      return null;
  }
}

/**
 * The grey "Accept by" line. A live offer gets the time as well as the day; an
 * expired one only the day it ended; declined and accepted offers get none.
 */
export function acceptByLine(
  status: ApplicationStatus,
  offerExpiresAt: number | undefined,
  now: number,
): string | null {
  if (offerExpiresAt === undefined) return null;
  switch (offerTiming(status, offerExpiresAt, now)) {
    case "live":
    case "urgent":
      return `Accept by ${formatOfferDeadline(offerExpiresAt, { withTime: true })}`;
    case "expired":
      return `Accept by ${formatOfferDeadline(offerExpiresAt)}`;
    default:
      return null;
  }
}
