import * as React from "react";
import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { ChevronsUpDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// Figma "Sidebar": a 200px column with a header, nav items, and the account at
// the bottom. `collapsed` shrinks it to an icon rail; labels stay readable by
// screen readers.
function Sidebar({
  collapsed = false,
  className,
  ...props
}: React.ComponentProps<"aside"> & { collapsed?: boolean }) {
  return (
    <aside
      data-slot="sidebar"
      data-collapsed={collapsed || undefined}
      className={cn(
        "group/sidebar flex h-full w-50 shrink-0 flex-col justify-between gap-5 overflow-y-auto border-r border-border bg-background px-2 py-6 data-collapsed:w-14",
        className,
      )}
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
      className={cn(
        "flex min-h-6 items-center justify-between gap-2 px-3 group-data-collapsed/sidebar:px-2",
        className,
      )}
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
 * One nav link. Pass `render={<Link href="..." />}` for client-side navigation.
 * `active` marks the current page.
 */
function SidebarItem({
  active = false,
  icon,
  badge,
  className,
  children,
  render,
  ...props
}: useRender.ComponentProps<"a"> & {
  active?: boolean;
  icon?: React.ReactNode;
  /** A count, e.g. unread items. */
  badge?: React.ReactNode;
}) {
  const element = useRender({
    defaultTagName: "a",
    props: mergeProps<"a">(
      {
        "aria-current": active ? "page" : undefined,
        className: cn(
          "flex w-full items-center gap-2 rounded-sm px-3 py-2 text-body text-neutral-700 transition-colors outline-none hover:bg-neutral-50 focus-visible:ring-3 focus-visible:ring-ring/50 data-active:bg-muted data-active:font-medium data-active:text-foreground [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
          className,
        ),
        children: (
          <>
            {icon}
            <span className="min-w-0 flex-1 truncate group-data-collapsed/sidebar:sr-only">
              {children}
            </span>
            {badge != null && (
              <span className="flex min-w-4.5 items-center justify-center rounded-full bg-neutral-500 px-1.25 py-px text-body-xs font-medium text-white group-data-collapsed/sidebar:sr-only">
                {badge}
              </span>
            )}
          </>
        ),
      },
      props,
    ),
    render,
    state: { slot: "sidebar-item", active },
  });
  return <li className="flex">{element}</li>;
}

function SidebarFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="sidebar-footer" className={cn("flex flex-col gap-1", className)} {...props} />
  );
}

/** The signed-in account at the bottom. Usually the trigger for an account menu. */
function SidebarAccount({
  avatar,
  className,
  children,
  render,
  ...props
}: useRender.ComponentProps<"button"> & { avatar: React.ReactNode }) {
  return useRender({
    defaultTagName: "button",
    props: mergeProps<"button">(
      {
        type: "button",
        className: cn(
          "flex w-full items-center gap-2 rounded-sm px-3 py-1.5 text-left text-body font-medium text-neutral-900 transition-colors outline-none hover:bg-neutral-50 focus-visible:ring-3 focus-visible:ring-ring/50 group-data-collapsed/sidebar:px-2",
          className,
        ),
        children: (
          <>
            {avatar}
            <span className="min-w-0 flex-1 truncate group-data-collapsed/sidebar:sr-only">
              {children}
            </span>
            <ChevronsUpDownIcon
              aria-hidden
              className="size-4 shrink-0 group-data-collapsed/sidebar:hidden"
            />
          </>
        ),
      },
      props,
    ),
    render,
    state: { slot: "sidebar-account" },
  });
}

export {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarNav,
  SidebarItem,
  SidebarFooter,
  SidebarAccount,
};
