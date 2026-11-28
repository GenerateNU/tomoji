"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Opens the item a link names in its query string, such as a notification's
 * `/opportunities?opportunity=<id>`. The page reads the parameter and passes it
 * in; `onOpen` runs on the first render and again whenever the link changes, so
 * a second notification opens while the page is already showing.
 *
 * Returns `onOpenChange` wrapped for the item's modal: closing also drops the
 * parameter, so a refresh doesn't reopen it and following the same link again
 * counts as a change.
 */
export function useLinkedItem(
  linkedId: string | undefined,
  { onOpen, onOpenChange }: { onOpen: (id: string) => void; onOpenChange: (open: boolean) => void },
) {
  const router = useRouter();
  const pathname = usePathname();
  const [seen, setSeen] = useState<string | undefined>(undefined);
  if (linkedId !== seen) {
    setSeen(linkedId);
    if (linkedId !== undefined) onOpen(linkedId);
  }
  return (open: boolean) => {
    onOpenChange(open);
    if (!open && linkedId !== undefined) router.replace(pathname, { scroll: false });
  };
}
