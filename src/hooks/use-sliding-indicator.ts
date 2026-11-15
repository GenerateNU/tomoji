"use client";

import { useLayoutEffect, useState, type CSSProperties, type RefObject } from "react";

export const indicatorTransition =
  "transition-[translate,width] duration-150 ease-out motion-reduce:transition-none";

type Box = { left: number; width: number };

/**
 * Measures the direct child of `ref` matching `selector` (usually the selected
 * tab) so an absolutely positioned underline or pill can slide to it. It
 * re-measures when the container or its children resize, or when children or
 * their `aria-selected` / `aria-checked` / `aria-current` change. `animate`
 * turns true one frame after the first measurement, so the indicator doesn't
 * slide in on first paint.
 */
export function useSlidingIndicator(
  ref: RefObject<HTMLElement | null>,
  selector: string,
): { style: CSSProperties | undefined; animate: boolean } {
  const [box, setBox] = useState<Box | null>(null);
  const [animate, setAnimate] = useState(false);

  useLayoutEffect(() => {
    const container = ref.current;
    if (!container) return;
    const measure = () => {
      const el = container.querySelector<HTMLElement>(`:scope > ${selector}`);
      const next = el ? { left: el.offsetLeft, width: el.offsetWidth } : null;
      setBox((prev) => (prev?.left === next?.left && prev?.width === next?.width ? prev : next));
    };
    measure();
    const resizeObserver = new ResizeObserver(measure);
    const observeChildren = () => {
      resizeObserver.disconnect();
      resizeObserver.observe(container);
      for (const child of container.children) resizeObserver.observe(child);
    };
    observeChildren();
    const mutationObserver = new MutationObserver(() => {
      observeChildren();
      measure();
    });
    mutationObserver.observe(container, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["aria-selected", "aria-checked", "aria-current"],
    });
    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [ref, selector]);

  useLayoutEffect(() => {
    if (!box || animate) return;
    const frame = requestAnimationFrame(() => setAnimate(true));
    return () => cancelAnimationFrame(frame);
  }, [box, animate]);

  return {
    style: box ? { width: box.width, translate: `${box.left}px 0` } : undefined,
    animate,
  };
}
