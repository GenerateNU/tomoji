"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { RiCloseLine } from "@remixicon/react";
import { ModalIconButton } from "@/components/modal";
import { cn } from "@/lib/utils";

/**
 * A panel that slides in from the right over a dimmed page, e.g. the
 * opportunity filters. Built on the Dialog primitives, so focus is trapped
 * and returns to the trigger on close.
 */
function Sheet({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetContent({
  title,
  className,
  children,
  ...props
}: DialogPrimitive.Popup.Props & { title: React.ReactNode }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-gray-950/40 transition-opacity data-ending-style:opacity-0 data-starting-style:opacity-0" />
      <DialogPrimitive.Popup
        data-slot="sheet-content"
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-full max-w-[492px] flex-col gap-8 overflow-y-auto bg-gray-0 p-10 text-gray-950 shadow-overlay outline-none transition-transform data-ending-style:translate-x-full data-starting-style:translate-x-full",
          className,
        )}
        {...props}
      >
        <div className="flex items-start justify-between gap-4">
          <DialogPrimitive.Title className="text-heading-sm text-gray-950">
            {title}
          </DialogPrimitive.Title>
          <DialogPrimitive.Close render={<ModalIconButton icon={RiCloseLine} label="Close" />} />
        </div>
        {children}
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  );
}

export { Sheet, SheetContent };
