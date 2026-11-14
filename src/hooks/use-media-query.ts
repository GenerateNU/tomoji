"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether the media query currently matches. Reports `serverValue` while
 * rendering on the server and during hydration, then the real answer.
 */
export function useMediaQuery(query: string, serverValue = false): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}
