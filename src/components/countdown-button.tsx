"use client";

import { useEffect, useRef, useState, type ComponentProps } from "react";
import { cn } from "@/lib/utils";

type CountdownButtonProps = Omit<ComponentProps<"button">, "onClick"> & {
  /** Runs once, when the button is pressed or the countdown reaches zero. */
  onComplete: () => void;
  /** How long before it completes on its own. */
  seconds?: number;
  /** Shows the seconds left after the label. */
  showTime?: boolean;
};

/**
 * Figma "Countdown Button": a primary action that completes itself, e.g. "Done"
 * on a success dialog. A darker fill sweeps left to right as time runs out.
 */
export function CountdownButton({
  onComplete,
  seconds = 5,
  showTime = true,
  children = "Done",
  className,
  ...props
}: CountdownButtonProps) {
  const [remaining, setRemaining] = useState(seconds);
  // Refs, so a re-render with a new callback neither restarts the timer nor
  // lets a press and the timeout both complete.
  const completed = useRef(false);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  });

  const complete = () => {
    if (completed.current) return;
    completed.current = true;
    onCompleteRef.current();
  };

  useEffect(() => {
    if (remaining > 0) {
      const timer = setTimeout(() => setRemaining((value) => value - 1), 1000);
      return () => clearTimeout(timer);
    }
    if (!completed.current) {
      completed.current = true;
      onCompleteRef.current();
    }
  }, [remaining]);

  const elapsed = (seconds - remaining) / seconds;
  return (
    <button
      type="button"
      onClick={complete}
      className={cn(
        "relative isolate inline-flex h-11.25 shrink-0 items-center justify-center gap-1.5 overflow-hidden rounded-sm px-4 text-body font-medium text-primary-foreground outline-none select-none focus-visible:ring-4 focus-visible:ring-ring/25",
        className,
      )}
      {...props}
    >
      <span aria-hidden className="absolute inset-0 -z-10 bg-primary/40" />
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 -z-10 bg-primary transition-[width] duration-1000 ease-linear motion-reduce:transition-none"
        style={{ width: `${elapsed * 100}%` }}
      />
      {children}
      {showTime && (
        <span className="font-normal opacity-70" aria-live="off">
          {Math.max(0, remaining)}s
        </span>
      )}
    </button>
  );
}
