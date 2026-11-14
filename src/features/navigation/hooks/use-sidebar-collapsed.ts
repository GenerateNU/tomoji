"use client";

import { useSyncExternalStore } from "react";
import { useMediaQuery } from "@/hooks/use-media-query";

const STORAGE_KEY = "sidebar-collapsed";
const listeners = new Set<() => void>();
// Keeps the choice for this page view when localStorage is unavailable (private mode, blocked).
let remembered: string | null = null;

function read(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? remembered;
  } catch {
    return remembered;
  }
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * Whether the desktop sidebar is folded to its rail, and a way to change it.
 * With no saved choice it follows the screen: a rail below 1024px, expanded at
 * and above it. Once the user folds or unfolds it, that choice is saved in
 * localStorage and wins at every width.
 */
export function useSidebarCollapsed(): [boolean, (collapsed: boolean) => void] {
  // Reads after hydration, so the server and first client render agree.
  const saved = useSyncExternalStore(subscribe, read, () => null);
  const isLarge = useMediaQuery("(min-width: 1024px)", true);
  const collapsed = saved === null ? !isLarge : saved === "true";

  function setCollapsed(next: boolean) {
    remembered = String(next);
    try {
      localStorage.setItem(STORAGE_KEY, remembered);
    } catch {
      // The in-memory copy still applies for this page view.
    }
    listeners.forEach((listener) => listener());
  }
  return [collapsed, setCollapsed];
}
