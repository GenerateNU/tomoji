"use client";

import { useLayoutEffect, useState, type RefObject } from "react";

/** Room kept free at the end of the first line for the `+N` badge, in px. */
const BADGE_WIDTH = 40;

export type OverflowState = {
  /** How many children are not shown on the first line. */
  count: number;
  /** Where to place the `+N` badge, in px from the row's positioned ancestor. */
  left: number;
};

/**
 * How many of a wrapping row's children don't fit on its first line, and where
 * the `+N` badge summarising them belongs.
 *
 * Children that don't fit stay mounted and are clipped by the row's
 * `overflow-hidden`, so measuring never changes what is measured. Dropping
 * them from the DOM instead would make the row fit, re-measure to zero, and
 * oscillate.
 *
 * The last child on the first line is also counted as overflow when the badge
 * would not fit after it, so the badge always has somewhere to sit.
 */
export function useOverflowCount(ref: RefObject<HTMLElement | null>, key: string): OverflowState {
  const [state, setState] = useState<OverflowState>({ count: 0, left: 0 });

  useLayoutEffect(() => {
    const row = ref.current;
    if (!row) return;

    const measure = () => {
      const children = [...row.children] as HTMLElement[];
      if (children.length === 0) return setState({ count: 0, left: 0 });

      const firstTop = children[0].offsetTop;
      const onFirstLine = children.filter((child) => child.offsetTop === firstTop);
      const next = (): OverflowState => {
        // Everything fits, so there is nothing to summarise.
        if (onFirstLine.length === children.length) return { count: 0, left: 0 };
        // Drop trailing children until the badge fits after the last one kept.
        const limit = row.clientWidth - BADGE_WIDTH;
        let kept = onFirstLine.length;
        while (kept > 1) {
          const last = onFirstLine[kept - 1];
          if (last.offsetLeft + last.offsetWidth <= limit) break;
          kept -= 1;
        }
        const last = onFirstLine[kept - 1];
        return { count: children.length - kept, left: last.offsetLeft + last.offsetWidth };
      };

      const measured = next();
      setState((current) =>
        current.count === measured.count && current.left === measured.left ? current : measured,
      );
    };

    measure();
    // The row rewraps when the pane resizes, not only when the values change.
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    for (const child of row.children) observer.observe(child);
    return () => observer.disconnect();
  }, [ref, key]);

  return state;
}
