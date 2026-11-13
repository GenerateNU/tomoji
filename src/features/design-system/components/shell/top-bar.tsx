"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { indicatorTransition, useSlidingIndicator } from "@/hooks/use-sliding-indicator";
import { focusRing } from "@/lib/styles";
import { cn } from "@/lib/utils";

const LINKS = [
  { label: "App", href: "/", match: (path: string) => path === "/" },
  {
    label: "Design system",
    href: "/design-system",
    match: (path: string) => path === "/design-system" || path.startsWith("/design-system/"),
  },
];

export function TopBar() {
  const pathname = usePathname();
  const active = LINKS.find((link) => link.match(pathname));
  const scroller = useRef<HTMLDivElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  const indicator = useSlidingIndicator(strip, '[aria-current="page"]');

  useEffect(() => {
    const el = scroller.current;
    const current = el?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!el || !current || el.scrollWidth <= el.clientWidth) return;
    el.scrollLeft = current.offsetLeft + current.offsetWidth - el.clientWidth + 16;
  }, [active?.href]);

  return (
    <header className="sticky top-0 z-40 flex h-13 shrink-0 items-stretch gap-4 border-b border-gray-100 bg-gray-0/90 px-6 backdrop-blur sm:px-12">
      <Link
        href="/"
        className={cn(
          "hidden self-center truncate rounded-xs text-body font-semibold text-gray-950 sm:block",
          focusRing,
        )}
      >
        Tomoji
      </Link>
      <div
        ref={scroller}
        className="flex min-w-0 self-end overflow-x-auto [scrollbar-width:none] sm:ml-auto sm:shrink-0"
      >
        <nav aria-label="Site" className="shrink-0">
          <div ref={strip} className="relative flex">
            {LINKS.map((link) => {
              const selected = active?.href === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={selected ? "page" : undefined}
                  className={cn(
                    "px-2.5 py-4 text-body-sm whitespace-nowrap transition-colors",
                    focusRing,
                    selected
                      ? "font-medium text-gray-950"
                      : "font-normal text-gray-500 hover:text-gray-950",
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
            <span
              aria-hidden="true"
              style={indicator.style}
              className={cn(
                "absolute bottom-0 left-0 h-0.75 bg-blue-primary",
                !indicator.style && "hidden",
                indicator.animate && indicatorTransition,
              )}
            />
          </div>
        </nav>
      </div>
    </header>
  );
}
