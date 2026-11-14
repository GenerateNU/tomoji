"use client";

import * as React from "react";
import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { RiSidebarFoldLine, RiSidebarUnfoldLine } from "@remixicon/react";
import { AvatarLabel } from "@/components/avatar-label";
import { iconProps } from "@/lib/icons";
import { focusRing } from "@/lib/styles";
import { cn } from "@/lib/utils";

const FADE = "transition-opacity duration-200 ease-out";

// A collapsed rail hides its labels. They stay in the DOM for screen readers and
// fade back in while the rail is peeking open: hovered (after 100ms), holding
// keyboard focus, or with its account menu open.
const COLLAPSED_FADE = cn(
  FADE,
  "opacity-0 group-data-peek/sidebar:group-hover/sidebar:opacity-100 group-data-peek/sidebar:group-hover/sidebar:delay-100 group-has-[:focus-visible]/sidebar:opacity-100 group-has-[[data-popup-open]]/sidebar:opacity-100",
);

// The campaign panel beside a rail shrinks and fades while that rail peeks open.
const CAMPAIGN_PANEL_FADE = cn(
  FADE,
  "group-has-[[data-peek]:hover]/campaign:opacity-0 group-has-[[data-peek]:hover]/campaign:delay-100 group-has-[[data-sidebar]_:focus-visible]/campaign:opacity-0 group-has-[[data-sidebar]_:has([data-popup-open])]/campaign:opacity-0",
);

const PEEK_WIDTH = {
  page: "w-14 data-peek:hover:w-50 data-peek:hover:delay-100 has-[:focus-visible]:w-50 has-[[data-popup-open]]:w-50",
  panel:
    "w-14 data-peek:hover:w-44 data-peek:hover:delay-100 has-[:focus-visible]:w-44 has-[[data-popup-open]]:w-44",
} as const;

type SidebarContextValue = {
  collapsed: boolean;
  /** Classes for anything that fades with the labels. */
  fade: string;
  /** Stops the rail peeking open until the pointer leaves it. */
  holdPeek: () => void;
};

const SidebarContext = React.createContext<SidebarContextValue>({
  collapsed: false,
  fade: FADE,
  holdPeek: () => {},
});

/**
 * A 200px column with a header, nav and the account at the bottom. `collapsed`
 * shrinks it to a 56px rail, animating the width over 200ms; hovering the rail
 * peeks it open after 100ms. `peek="panel"` peeks to 176px instead, for a rail
 * that sits beside a campaign panel.
 */
function Sidebar({
  collapsed = false,
  peek = "page",
  className,
  children,
  onMouseLeave,
  ...props
}: React.ComponentProps<"aside"> & { collapsed?: boolean; peek?: "page" | "panel" }) {
  const ref = React.useRef<HTMLElement>(null);
  const [peekAllowed, setPeekAllowed] = React.useState(true);
  const value = React.useMemo<SidebarContextValue>(
    () => ({
      collapsed,
      fade: collapsed ? COLLAPSED_FADE : FADE,
      holdPeek: () => {
        if (ref.current?.matches(":hover")) setPeekAllowed(false);
      },
    }),
    [collapsed],
  );

  return (
    <aside
      ref={ref}
      data-slot="sidebar"
      data-sidebar=""
      data-collapsed={collapsed || undefined}
      data-peek={collapsed && peekAllowed ? "" : undefined}
      onMouseLeave={(event) => {
        setPeekAllowed(true);
        onMouseLeave?.(event);
      }}
      className={cn(
        "group/sidebar h-full shrink-0 overflow-hidden bg-gray-10 transition-[width] duration-200 ease-out motion-reduce:transition-none",
        collapsed ? PEEK_WIDTH[peek] : "w-50",
        className,
      )}
      {...props}
    >
      <div
        className={cn(
          "flex h-full flex-col justify-between gap-5 overflow-x-hidden overflow-y-auto px-2 py-6",
          collapsed ? (peek === "panel" ? "w-44" : "w-50") : "w-full min-w-50",
        )}
      >
        <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>
      </div>
    </aside>
  );
}

/** The page beside a sidebar: white, lifted with the page shadow. */
function SidebarPage({ className, ...props }: React.ComponentProps<"main">) {
  return (
    <main
      data-slot="sidebar-page"
      className={cn("relative min-w-0 flex-1 bg-gray-0 shadow-page", className)}
      {...props}
    />
  );
}

/** Groups the header and nav so the footer stays pinned to the bottom. */
function SidebarContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="sidebar-content" className={cn("flex flex-col gap-5", className)} {...props} />
  );
}

function SidebarHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-header"
      className={cn("flex min-h-6 items-center justify-between gap-2 px-3", className)}
      {...props}
    />
  );
}

/** The fold/unfold button for the header. Labels itself for the current state. */
function SidebarToggle({
  onCollapsedChange,
  className,
  ...props
}: Omit<React.ComponentProps<"button">, "onClick"> & {
  onCollapsedChange?: (collapsed: boolean) => void;
}) {
  const { collapsed, fade, holdPeek } = React.useContext(SidebarContext);
  const Icon = collapsed ? RiSidebarUnfoldLine : RiSidebarFoldLine;
  return (
    <button
      type="button"
      data-slot="sidebar-toggle"
      aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      onClick={() => {
        // Collapsing under the pointer would otherwise peek straight back open.
        if (!collapsed) holdPeek();
        onCollapsedChange?.(!collapsed);
      }}
      className={cn(
        "shrink-0 rounded-xs text-gray-500 hover:text-gray-950",
        focusRing,
        fade,
        className,
      )}
      {...props}
    >
      <Icon {...iconProps} />
    </button>
  );
}

/** Fades with the sidebar's labels, e.g. a company name in the header. */
function SidebarLabel({ className, ...props }: React.ComponentProps<"span">) {
  const { fade } = React.useContext(SidebarContext);
  return (
    <span
      data-slot="sidebar-label"
      className={cn("min-w-0 truncate text-body font-medium text-gray-950", fade, className)}
      {...props}
    />
  );
}

/** Needs an `aria-label` when a page has more than one sidebar nav. */
function SidebarNav({ className, children, ...props }: React.ComponentProps<"nav">) {
  return (
    <nav data-slot="sidebar-nav" className={cn(className)} {...props}>
      <ul className="flex flex-col gap-1">{children}</ul>
    </nav>
  );
}

/**
 * One nav link, marked by a 3px bar on its left edge. Pass
 * `render={<Link href="..." />}` for client-side navigation. `active` marks the
 * current page and swaps in `activeIcon`; `active="parent"` marks the section a
 * nested panel belongs to (gray bar), e.g. Campaigns while a campaign's own nav
 * is open.
 */
function SidebarItem({
  active = false,
  icon,
  activeIcon,
  badge,
  disabled = false,
  className,
  children,
  render,
  ...props
}: useRender.ComponentProps<"a"> & {
  active?: boolean | "parent";
  /**
   * For a destination that doesn't exist yet: dimmed, out of the tab order, and
   * announced as "(coming soon)". Like a disabled pagination link, it has no
   * `href`, so pass a plain item rather than a `render={<Link />}`.
   */
  disabled?: boolean;
  icon?: React.ReactNode;
  /** A filled icon shown instead of `icon` while active. */
  activeIcon?: React.ReactNode;
  /** A count, e.g. unread items. */
  badge?: React.ReactNode;
}) {
  const { fade } = React.useContext(SidebarContext);
  const selected = active !== false && !disabled;
  const element = useRender({
    defaultTagName: "a",
    props: mergeProps<"a">(
      {
        "aria-current":
          !disabled && active === true
            ? "page"
            : !disabled && active === "parent"
              ? "true"
              : undefined,
        className: cn(
          "group/sidebar-item relative flex min-h-9.25 w-full items-center gap-2 rounded px-3 py-2 text-body text-gray-700 transition-colors not-aria-disabled:hover:text-gray-950 data-active:font-medium data-active:text-gray-950 data-parent:font-medium data-parent:text-gray-950 aria-disabled:cursor-not-allowed aria-disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-gray-500 not-aria-disabled:hover:[&_svg]:text-gray-700 data-active:[&_svg]:text-gray-950 data-parent:[&_svg]:text-gray-950",
          "before:absolute before:inset-y-0 before:left-0 before:w-0.75 before:bg-transparent before:transition-colors not-aria-disabled:hover:before:bg-gray-100 data-parent:before:bg-gray-200 data-active:before:bg-blue-primary",
          focusRing,
          className,
        ),
        children: (
          <>
            {selected && activeIcon ? activeIcon : icon}
            <span className={cn("min-w-0 flex-1 truncate", fade)}>{children}</span>
            {disabled && <span className="sr-only">(coming soon)</span>}
            {badge != null && (
              <span
                className={cn(
                  "flex h-4 shrink-0 items-center rounded-full bg-blue-primary px-1.5 text-body-xs font-medium text-gray-0",
                  fade,
                )}
              >
                {badge}
              </span>
            )}
          </>
        ),
      },
      props,
      disabled ? { "aria-disabled": true as const, href: undefined, tabIndex: -1 } : {},
    ),
    render,
    state: {
      slot: "sidebar-item",
      active: active === true && !disabled,
      parent: active === "parent" && !disabled,
    },
  });
  return <li className="flex">{element}</li>;
}

function SidebarFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="sidebar-footer" className={cn("flex flex-col gap-1", className)} {...props} />
  );
}

/**
 * The signed-in account at the bottom, usually the trigger for an account menu
 * (View profile, Settings). Pass the trigger via `render` from a menu trigger,
 * or use it as a plain button. The chevron shows on hover, focus and while the
 * menu is open.
 */
function SidebarAccount({
  avatar,
  className,
  children,
  render,
  ...props
}: Omit<React.ComponentProps<"button">, "children"> & {
  avatar: React.ReactNode;
  /** The account name. */
  children: string;
  render?: useRender.ComponentProps<"div">["render"];
}) {
  const { fade } = React.useContext(SidebarContext);
  return (
    <AvatarLabel
      avatar={avatar}
      name={children}
      chevron
      textClassName={fade}
      render={render ?? <button type="button" />}
      className={cn("w-full", className)}
      {...(props as React.ComponentProps<"div">)}
    />
  );
}

/** Wraps a rail and its campaign panel so the panel can react to the rail peeking. */
function SidebarGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-group"
      className={cn("group/campaign flex h-full shrink-0", className)}
      {...props}
    />
  );
}

/**
 * A second column beside a collapsed rail, e.g. a campaign's nav. Closing it
 * animates the width to 0 and makes its contents inert.
 */
function SidebarPanel({
  open = true,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & { open?: boolean }) {
  const value = React.useMemo<SidebarContextValue>(
    () => ({ collapsed: false, fade: CAMPAIGN_PANEL_FADE, holdPeek: () => {} }),
    [],
  );
  return (
    <div
      data-slot="sidebar-panel"
      inert={!open}
      className={cn(
        "h-full shrink-0 overflow-hidden transition-[width] duration-200 ease-out motion-reduce:transition-none",
        open
          ? "w-44 group-has-[[data-peek]:hover]/campaign:w-14 group-has-[[data-peek]:hover]/campaign:delay-100 group-has-[[data-sidebar]_:focus-visible]/campaign:w-14 group-has-[[data-sidebar]_:has([data-popup-open])]/campaign:w-14"
          : "w-0",
        className,
      )}
      {...props}
    >
      <SidebarContext.Provider value={value}>
        <aside className="flex h-full w-44 flex-col gap-5 bg-gray-10 px-2 py-6">{children}</aside>
      </SidebarContext.Provider>
    </div>
  );
}

export {
  Sidebar,
  SidebarPage,
  SidebarContent,
  SidebarHeader,
  SidebarToggle,
  SidebarLabel,
  SidebarNav,
  SidebarItem,
  SidebarFooter,
  SidebarAccount,
  SidebarGroup,
  SidebarPanel,
};
