"use client";

import type { ReactNode } from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { RiCloseLine } from "@remixicon/react";
import { Breadcrumbs, type BreadcrumbItemData } from "@/components/ui/breadcrumb";
import { DialogContent } from "@/components/ui/dialog";
import { type IconComponent } from "@/lib/icons";
import { focusRing } from "@/lib/styles";
import { cn } from "@/lib/utils";

/** A 24px gray header control, like the Close button or a More menu trigger. */
export function ModalIconButton({
  icon: Icon,
  label,
  onClick,
  className,
}: {
  icon: IconComponent;
  /** Accessible name and tooltip. */
  label: string;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        // The negative margin keeps layout at 24px while touch screens get a 44px hit area.
        "flex shrink-0 cursor-pointer rounded-xs text-gray-500 transition-colors hover:text-gray-950 max-md:-m-2.5 max-md:p-2.5",
        focusRing,
        className,
      )}
    >
      <Icon size={24} aria-hidden />
    </button>
  );
}

type ModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  /** Uses the 18px, 28px or 32px heading treatment. Breadcrumbs use at least 28px. */
  titleSize?: "sm" | "lg" | "xl";
  breadcrumbs?: BreadcrumbItemData[];
  /** A row above the title, level with the header controls, e.g. who the modal is about. */
  eyebrow?: ReactNode;
  /** Tags or status beside the title. It wraps below a long title and stays outside the dialog's accessible name. */
  titleAddon?: ReactNode;
  /** Header controls placed before the close button. */
  actions?: ReactNode;
  /** Right-aligned action row. */
  footer?: ReactNode;
  children?: ReactNode;
  className?: string;
  /** Classes for the dimmed backdrop, e.g. a blur. */
  overlayClassName?: string;
  /** Where focus goes on close; the default is the element that opened the modal. */
  finalFocus?: React.ComponentProps<typeof DialogContent>["finalFocus"];
};

// Figma "Modal": a white dialog over a dimmed page. Built on the Dialog
// primitives, so focus is trapped and returns to the trigger on close.
export function Modal({
  open,
  onOpenChange,
  title,
  titleSize = "sm",
  breadcrumbs,
  eyebrow,
  titleAddon,
  actions,
  footer,
  children,
  className,
  overlayClassName,
  finalFocus,
}: ModalProps) {
  const above = breadcrumbs ? <Breadcrumbs items={breadcrumbs} className="min-w-0" /> : eyebrow;
  const big = titleSize !== "sm" || Boolean(breadcrumbs);
  const titleTypography =
    titleSize === "xl" ? "text-heading-lg" : big ? "text-heading-md" : "text-body-lg";
  const close = (
    <DialogPrimitive.Close render={<ModalIconButton icon={RiCloseLine} label="Close" />} />
  );
  const controls = actions ? (
    <div className="flex shrink-0 items-center gap-4">
      {actions}
      {close}
    </div>
  ) : (
    close
  );
  const heading = (
    <DialogPrimitive.Title
      className={cn(
        "min-w-0 font-medium text-gray-950",
        titleTypography,
        titleAddon && "break-words",
      )}
    >
      {title}
    </DialogPrimitive.Title>
  );
  const headingRow = titleAddon ? (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
      {heading}
      {titleAddon}
    </div>
  ) : (
    heading
  );

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        overlayClassName={overlayClassName}
        finalFocus={finalFocus}
        className={cn("flex flex-col gap-0 overflow-hidden", className)}
      >
        <div className="flex min-h-0 flex-1 flex-col gap-6 p-4 sm:p-6 md:p-8">
          {above ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-4">
                {above}
                {controls}
              </div>
              {headingRow}
            </div>
          ) : (
            <div className={cn("flex justify-between gap-4", big ? "items-start" : "items-center")}>
              {headingRow}
              {controls}
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
          {footer ? (
            <div className="flex flex-wrap items-center justify-end gap-2.5">{footer}</div>
          ) : null}
        </div>
      </DialogContent>
    </DialogPrimitive.Root>
  );
}
