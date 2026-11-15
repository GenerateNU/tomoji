"use client";

import { useEffect, useRef, useState, type ComponentProps } from "react";
import { focusRing } from "@/lib/styles";
import { cn } from "@/lib/utils";

type CountdownButtonProps = ComponentProps<"button"> & {
  /** Runs once, when the countdown reaches zero or the button is pressed. */
  onComplete?: () => void;
  /** How long before it completes on its own. */
  seconds?: number;
  /** Shows the seconds left after the label. */
  showTime?: boolean;
  /** Holds the timer where it is. `disabled` holds it too. */
  paused?: boolean;
};

/**
 * Figma "Countdown Button": a primary action that completes itself, e.g. "Done"
 * on a success dialog. A solid fill grows across a faded track as time runs
 * out. Pressing it completes it early. Change `key` to restart.
 */
export function CountdownButton({
  onComplete,
  onClick,
  seconds = 5,
  showTime = true,
  paused = false,
  disabled,
  children = "Done",
  className,
  ...props
}: CountdownButtonProps) {
  const [remaining, setRemaining] = useState(Math.ceil(seconds));
  const fillRef = useRef<HTMLSpanElement>(null);
  // Refs, so a re-render with a new callback neither restarts the timer nor
  // lets a press and the timer both complete, and a pause resumes in place.
  const elapsed = useRef(0);
  const completed = useRef(false);
  const [done, setDone] = useState(false);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  });

  const complete = () => {
    if (completed.current) return;
    completed.current = true;
    setDone(true);
    onCompleteRef.current?.();
  };

  // Driven every frame so the fill grows smoothly; a CSS transition per second
  // would step instead.
  useEffect(() => {
    if (paused || disabled || done) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      elapsed.current = Math.min(seconds, elapsed.current + (now - last) / 1000);
      last = now;
      if (fillRef.current) {
        fillRef.current.style.width = `${(elapsed.current / seconds) * 100}%`;
      }
      setRemaining(Math.ceil(seconds - elapsed.current));
      if (elapsed.current >= seconds) {
        complete();
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [paused, disabled, done, seconds]);

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(event) => {
        onClick?.(event);
        complete();
      }}
      className={cn(
        "relative isolate inline-flex h-11.25 shrink-0 cursor-pointer items-center justify-center gap-1.5 overflow-hidden rounded-sm bg-blue-primary/40 px-4 text-body font-medium whitespace-nowrap text-gray-0 select-none disabled:cursor-not-allowed disabled:opacity-40",
        focusRing,
        className,
      )}
      {...props}
    >
      <span
        ref={fillRef}
        aria-hidden
        className="absolute inset-y-0 left-0 -z-10 w-0 bg-blue-primary"
      />
      {children}
      {showTime && (
        <span className="font-normal tabular-nums opacity-70" aria-live="off">
          {remaining}s
        </span>
      )}
    </button>
  );
}
