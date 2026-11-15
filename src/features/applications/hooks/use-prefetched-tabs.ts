"use client";

import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";
import { defaultArgsForTab } from "./use-applications-table";

const APPLICATIONS_ARGS = defaultArgsForTab("applications");
const OFFERS_ARGS = defaultArgsForTab("offers");
const ACCEPTED_ARGS = defaultArgsForTab("accepted");

/**
 * Keeps every tab's default query subscribed while the page is mounted. Switching
 * tabs then lands on args that already have a result, so the new tab shows
 * instantly instead of a skeleton, and inactive tabs keep updating live. Convex
 * shares subscriptions with identical args, so the active tab costs nothing extra.
 * Always subscribes to all three, which keeps the hook order fixed.
 */
export function usePrefetchedTabs() {
  useQuery(api.applications.searchMine, APPLICATIONS_ARGS);
  useQuery(api.applications.searchMine, OFFERS_ARGS);
  useQuery(api.applications.searchMine, ACCEPTED_ARGS);
}
