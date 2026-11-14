// Figma shows short numeric dates in the modal's tables ("11/4/26").
const shortDate = new Intl.DateTimeFormat("en-US", {
  month: "numeric",
  day: "numeric",
  year: "2-digit",
});

/** "11/4/26": the date format used across the opportunity modal. */
export function formatModalDate(timestamp: number): string {
  return shortDate.format(timestamp);
}
