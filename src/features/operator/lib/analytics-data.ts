/**
 * Figures for the two analytics widgets on the operator home page.
 *
 * These are not read from the database yet: signup history needs a
 * time-bucketed read, and ranking companies by activity needs a per-company
 * rollup. Swap each constant for its query once those exist.
 */

export const SIGNUPS = {
  // Every third week is labelled, so the axis stays readable at phone width.
  weeks: ["Aug 18", "", "", "Sep 8", "", "", "Sep 29", "", "", "Oct 20", "", ""],
  creators: [4, 6, 5, 9, 8, 12, 11, 15, 14, 19, 17, 22],
  companyUsers: [1, 2, 2, 3, 3, 4, 5, 4, 6, 7, 6, 9],
} as const;

export const COMPANY_ACTIVITY = [
  { label: "Northstar Studio", value: 18 },
  { label: "Lumen Labs", value: 14 },
  { label: "Parallel Systems", value: 11 },
  { label: "Birch & Co", value: 7 },
  { label: "Terrace Analytics", value: 4 },
] as const;
