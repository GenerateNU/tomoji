import type { Infer } from "convex/values";
import type { reviewCriterion } from "@convex/lib/ai/validation";

export type ReviewCriterion = Infer<typeof reviewCriterion>;

// Mirrors the backend limits in convex/lib/ai/validation.ts so the form can
// stop a save the server would refuse.
export const MAX_CRITERIA = 20;
const MAX_CRITERION_LENGTH = 1000;

// "- ", "• ", "* ", "1. " or "1) " at the start of a line: people paste lists.
const LIST_MARKER = /^(?:[-•*]|\d+[.)])\s+/;

function criterionLines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim().replace(LIST_MARKER, "").trim())
    .filter((line) => line.length > 0);
}

/** Criteria as the form shows them: one per line. */
export function criteriaToText(criteria: readonly ReviewCriterion[]): string {
  return criteria.map((criterion) => criterion.description).join("\n");
}

/**
 * Turns the form's lines back into criteria. A line whose text matches an
 * existing criterion keeps that criterion's id, so AI review results recorded
 * against it still line up; new lines get the next free `criterion-N` id.
 */
export function criteriaFromText(
  text: string,
  existing: readonly ReviewCriterion[],
): ReviewCriterion[] {
  const unclaimed = [...existing];
  const usedIds = new Set(existing.map((criterion) => criterion.id));
  let next = 1;
  const freshId = () => {
    while (usedIds.has(`criterion-${next}`)) next += 1;
    const id = `criterion-${next}`;
    usedIds.add(id);
    return id;
  };
  return criterionLines(text).map((description) => {
    const match = unclaimed.findIndex((criterion) => criterion.description === description);
    if (match === -1) return { id: freshId(), description };
    const [kept] = unclaimed.splice(match, 1);
    return { id: kept.id, description };
  });
}

/** Why the criteria can't be saved, or null when they can. */
export function criteriaProblem(text: string, { required = false }: { required?: boolean }) {
  const lines = criterionLines(text);
  if (lines.length === 0) {
    return required ? "AI review is on for this opportunity, so add at least one." : null;
  }
  if (lines.length > MAX_CRITERIA) return `Use at most ${MAX_CRITERIA} criteria.`;
  if (lines.some((line) => line.length > MAX_CRITERION_LENGTH)) {
    return `Keep each criterion under ${MAX_CRITERION_LENGTH.toLocaleString("en-US")} characters.`;
  }
  if (new Set(lines).size !== lines.length) return "The same criterion is listed twice.";
  return null;
}
