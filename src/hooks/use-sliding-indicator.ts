"use client";

import { useLayoutEffect, useState, type CSSProperties, type RefObject } from "react";

export const indicatorTransition =
  "transition-[translate,width] duration-150 ease-out motion-reduce:transition-none";

type Box = { left: number; width: number };

/**
 * Measures the direct child of `ref` matching `selector` (usually the selected
 * tab) so an absolutely positioned underline or pill can slide to it. `animate`
 * turns true one frame after the first measurement, so the indicator doesn't
 * slide in on first paint. Pass `deps` to re-measure when something other than
 * a render changes the layout. (Measurement already runs after every render, so
 * `deps` only documents what callers expect to trigger a re-measure.)
 */
export function useSlidingIndicator(
  ref: RefObject<HTMLElement | null>,
  selector: string,
  deps: readonly unknown[] = [],
): { style: CSSProperties | undefined; animate: boolean } {
  const [box, setBox] = useState<Box | null>(null);
  const [animate, setAnimate] = useState(false);

  // Re-measure after every render, like the reference: the selected child can
  // change without the container resizing.
  useLayoutEffect(() => {
    const container = ref.current;
    if (!container) return;
    const measure = () => {
      const el = container.querySelector<HTMLElement>(`:scope > ${selector}`);
      const next = el ? { left: el.offsetLeft, width: el.offsetWidth } : null;
      setBox((prev) => (prev?.left === next?.left && prev?.width === next?.width ? prev : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  });

  useLayoutEffect(() => {
    if (!box || animate) return;
    const frame = requestAnimationFrame(() => setAnimate(true));
    return () => cancelAnimationFrame(frame);
  }, [box, animate]);

  void deps;
  return {
    style: box ? { width: box.width, translate: `${box.left}px 0` } : undefined,
    animate,
  };
}
