// Class strings shared by the design-system components. Plain strings so any
// component can compose them with cn.

export const focusRing = "outline-none focus-visible:ring-4 focus-visible:ring-blue-primary/25";

export const focusWithinRing = "outline-none focus-within:ring-4 focus-within:ring-blue-primary/25";

// Hover and press tints layer a gradient over the fill, so the base color
// never changes. The gradient snaps in; only opacity animates.
export const overlayOnDark =
  "enabled:hover:bg-[linear-gradient(rgba(255,255,255,0.1),rgba(255,255,255,0.1))] enabled:active:bg-[linear-gradient(rgba(255,255,255,0.2),rgba(255,255,255,0.2))]";

export const overlayOnLight =
  "enabled:hover:bg-[linear-gradient(rgba(0,0,0,0.06),rgba(0,0,0,0.06))] enabled:active:bg-[linear-gradient(rgba(0,0,0,0.12),rgba(0,0,0,0.12))]";

export const overlayOnLightSoft =
  "enabled:hover:bg-[linear-gradient(rgba(0,0,0,0.04),rgba(0,0,0,0.04))] enabled:active:bg-[linear-gradient(rgba(0,0,0,0.04),rgba(0,0,0,0.04))]";

export const overlayOnBlue12 =
  "enabled:hover:bg-[linear-gradient(rgba(0,0,0,0.12),rgba(0,0,0,0.12))] enabled:active:bg-[linear-gradient(rgba(0,0,0,0.12),rgba(0,0,0,0.12))]";

export const ghostFade = "enabled:hover:opacity-80 enabled:active:opacity-60";

// The 1px border plus a 1px outline inset by 2px reads as a 2px border.
export const fieldBox = "flex w-full rounded border transition-shadow";

export function fieldBoxState(error?: boolean) {
  return error
    ? "border-red-600 bg-red-50 outline -outline-offset-2 outline-red-600 focus-within:ring-4 focus-within:ring-blue-primary/25"
    : "border-gray-300 bg-gray-0 focus-within:border-blue-primary focus-within:outline focus-within:-outline-offset-2 focus-within:outline-blue-primary focus-within:ring-4 focus-within:ring-blue-primary/25";
}

export const fieldLabel =
  "flex gap-0.5 text-body-sm font-medium text-gray-500 transition-colors group-focus-within:text-gray-950";

export const menuPanel =
  "flex w-50 flex-col gap-0.5 rounded-lg border border-gray-100 bg-background p-1.5 shadow-overlay";

export type MenuItemTone = "default" | "destructive";

export function menuItem(tone: MenuItemTone = "default") {
  return [
    "flex w-full cursor-pointer items-center gap-2 rounded p-2 text-left text-body font-normal transition-colors outline-none focus-visible:ring-4 focus-visible:ring-blue-primary/25 disabled:cursor-not-allowed disabled:opacity-40",
    tone === "destructive"
      ? "text-red-700 enabled:hover:bg-red-50"
      : "text-gray-950 enabled:hover:bg-gray-50",
  ].join(" ");
}
