"use client";

import { RiCloseLine, RiMenuLine } from "@remixicon/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  COMPONENTS,
  FOUNDATIONS,
  INTRODUCTION,
  type DocEntry,
} from "@/features/design-system/lib/registry";
import { iconProps } from "@/lib/icons";
import { focusRing } from "@/lib/styles";
import { cn } from "@/lib/utils";

function NavLink({ entry, onNavigate }: { entry: DocEntry; onNavigate: () => void }) {
  const current = usePathname() === entry.href;
  return (
    <Link
      href={entry.href}
      onClick={onNavigate}
      aria-current={current ? "page" : undefined}
      className={cn(
        "block rounded px-2.5 py-1.5 text-body-sm transition-colors",
        focusRing,
        current
          ? "bg-gray-50 font-medium text-gray-950"
          : "font-normal text-gray-500 hover:bg-gray-25 hover:text-gray-950",
      )}
    >
      {entry.name}
    </Link>
  );
}

function NavGroup({
  title,
  entries,
  onNavigate,
}: {
  title: string;
  entries: DocEntry[];
  onNavigate: () => void;
}) {
  return (
    <div>
      <p className="px-2.5 pb-1.5 text-body-xs font-medium tracking-[0.04em] text-gray-500 uppercase">
        {title}
      </p>
      <div className="flex flex-col gap-0.5">
        {entries.map((entry) => (
          <NavLink key={entry.href} entry={entry} onNavigate={onNavigate} />
        ))}
      </div>
    </div>
  );
}

const FOUNDATION_ENTRIES = [INTRODUCTION, ...FOUNDATIONS];

export function DocsNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [openedAt, setOpenedAt] = useState(pathname);
  const toggle = useRef<HTMLButtonElement>(null);
  const aside = useRef<HTMLElement>(null);

  // The drawer closes on any route change, including back/forward navigation.
  if (openedAt !== pathname) {
    setOpenedAt(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (open) aside.current?.querySelector("a")?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (aside.current?.contains(target) || toggle.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      toggle.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const closeFromLink = () => {
    setOpen(false);
    toggle.current?.focus();
  };

  return (
    <>
      <button
        ref={toggle}
        type="button"
        aria-expanded={open}
        aria-controls="docs-nav"
        aria-label={open ? "Close navigation" : "Open navigation"}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "fixed top-16 right-6 z-50 flex size-9 items-center justify-center rounded border border-gray-200 bg-gray-0 text-gray-950 sm:right-12 md:hidden",
          focusRing,
        )}
      >
        {open ? <RiCloseLine {...iconProps} /> : <RiMenuLine {...iconProps} />}
      </button>
      <aside
        ref={aside}
        id="docs-nav"
        aria-label="Design system"
        className={cn(
          "fixed top-13 bottom-0 left-0 z-30 w-72 shrink-0 overflow-y-auto border-r border-gray-100 bg-gray-0 pt-6 pr-4 pb-10 pl-3.5 transition-[translate,visibility] duration-150 sm:pl-9.5 md:sticky md:top-13 md:h-[calc(100dvh-3.25rem)] md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full max-md:invisible",
        )}
      >
        <div className="flex flex-col gap-7">
          <NavGroup title="Foundations" entries={FOUNDATION_ENTRIES} onNavigate={closeFromLink} />
          <NavGroup title="Components" entries={COMPONENTS} onNavigate={closeFromLink} />
        </div>
      </aside>
    </>
  );
}
