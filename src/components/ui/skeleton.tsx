"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

// Figma has no skeleton node; the reference draws a mosaic of 7px tiles with a
// 2px gap on a canvas. One shared requestAnimationFrame loop paints every
// mounted skeleton from page coordinates, so they all share a single wave.
const COLORS = ["#e5e5e6", "#dcdcde", "#d3d3d6", "#cacace"];
const TILE = 7;
const PITCH = 9;
const WAVE_PERIOD = 160;
const WAVE_SPEED = 160;
const WAVE_WIDTH = 24;

type Painter = (time: number) => void;

const painters = new Set<Painter>();
let frame = 0;

function tick(time: number) {
  painters.forEach((paint) => paint(time));
  frame = painters.size ? requestAnimationFrame(tick) : 0;
}

function subscribe(paint: Painter) {
  painters.add(paint);
  if (!frame) frame = requestAnimationFrame(tick);
  return () => {
    painters.delete(paint);
    if (!painters.size && frame) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
  };
}

/** A pixel-art placeholder. Size it with `className`, e.g. `h-5 w-48` or `size-10`. */
function Skeleton({
  circle = false,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  /** Keeps only the tiles inside the inscribed circle, for avatars. */
  circle?: boolean;
}) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    let columns = 0;
    let rows = 0;
    let offsetX = 0;
    let offsetY = 0;

    const measure = () => {
      const { width, height } = canvas.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      columns = Math.max(1, Math.floor((width - TILE) / PITCH) + 1);
      rows = Math.max(1, Math.floor((height - TILE) / PITCH) + 1);
      offsetX = (width - (PITCH * columns - 2)) / 2;
      offsetY = (height - (PITCH * rows - 2)) / 2;
    };

    // A null time paints the static base colour.
    const paint = (time: number | null) => {
      const rect = canvas.getBoundingClientRect();
      const shift = time === null ? 0 : ((time / 1000) * WAVE_SPEED) % WAVE_PERIOD;
      context.clearRect(0, 0, rect.width, rect.height);
      for (let row = 0; row < rows; row++) {
        const y = offsetY + PITCH * row;
        const rowShift = shift + 10 * Math.sin((rect.top + y) / 14);
        for (let column = 0; column < columns; column++) {
          if (circle) {
            const dx = (column + 0.5) / columns - 0.5;
            const dy = (row + 0.5) / rows - 0.5;
            if (dx * dx + dy * dy > 0.25) continue;
          }
          const x = offsetX + PITCH * column;
          const distance =
            (((rect.left + x + TILE / 2 - rowShift) % WAVE_PERIOD) + WAVE_PERIOD) % WAVE_PERIOD;
          const intensity =
            time === null
              ? 0
              : Math.max(0, 1 - Math.min(distance, WAVE_PERIOD - distance) / WAVE_WIDTH);
          context.fillStyle =
            COLORS[Math.min(COLORS.length - 1, Math.floor(intensity * COLORS.length))];
          context.fillRect(x, y, TILE, TILE);
        }
      }
    };

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let unsubscribe: (() => void) | undefined;

    const start = () => {
      unsubscribe?.();
      unsubscribe = undefined;
      if (reducedMotion.matches) {
        paint(null);
      } else {
        paint(performance.now());
        unsubscribe = subscribe(paint);
      }
    };

    measure();
    const observer = new ResizeObserver(() => {
      measure();
      paint(reducedMotion.matches ? null : performance.now());
    });
    observer.observe(canvas);
    start();
    reducedMotion.addEventListener("change", start);

    return () => {
      observer.disconnect();
      reducedMotion.removeEventListener("change", start);
      unsubscribe?.();
    };
  }, [circle]);

  return (
    <div
      data-slot="skeleton"
      aria-hidden
      className={cn("relative overflow-hidden", className)}
      {...props}
    >
      <canvas ref={canvasRef} className="absolute inset-0 size-full" />
    </div>
  );
}

/** Paragraph placeholder: 12px lines, 8px apart, the last one 60% wide. */
function SkeletonText({
  lines = 3,
  className,
  ...props
}: React.ComponentProps<"div"> & { lines?: number }) {
  return (
    <div aria-hidden className={cn("flex w-full flex-col gap-2", className)} {...props}>
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton
          key={index}
          className={cn("h-3", lines > 1 && index === lines - 1 ? "w-3/5" : "w-full")}
        />
      ))}
    </div>
  );
}

export { Skeleton, SkeletonText };
