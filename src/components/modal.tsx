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
        "flex shrink-0 cursor-pointer rounded-xs text-gray-500 transition-colors hover:text-gray-950",
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
  /** "lg" is 28px; breadcrumbs always use it. */
  titleSize?: "sm" | "lg";
  breadcrumbs?: BreadcrumbItemData[];
  /** Header controls placed before the close button. */
  actions?: ReactNode;
  /** Right-aligned action row. */
  footer?: ReactNode;
  children?: ReactNode;
  className?: string;
};

// Figma "Modal": a white dialog over a dimmed page. Built on the Dialog
// primitives, so focus is trapped and returns to the trigger on close.
export function Modal({
  open,
  onOpenChange,
  title,
  titleSize = "sm",
  breadcrumbs,
  actions,
  footer,
  children,
  className,
}: ModalProps) {
  const big = titleSize === "lg" || Boolean(breadcrumbs);
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
        "min-w-0 text-gray-950",
        big ? "text-heading-md font-medium" : "text-body-lg font-medium",
      )}
    >
      {title}
    </DialogPrimitive.Title>
  );

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className={cn("flex flex-col gap-0 overflow-hidden", className)}
      >
        <div className="flex min-h-0 flex-1 flex-col gap-6 p-8">
          {breadcrumbs ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-4">
                <Breadcrumbs items={breadcrumbs} className="min-w-0" />
                {controls}
              </div>
              {heading}
            </div>
          ) : (
            <div className={cn("flex justify-between gap-4", big ? "items-start" : "items-center")}>
              {heading}
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
