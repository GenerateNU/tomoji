// Class strings shared by the design-system components. Plain strings so any
// component can compose them with cn.

export const focusRing = "outline-none focus-visible:ring-4 focus-visible:ring-blue-primary/25";

// Hover and press tints layer a gradient over the fill, so the base color
// never changes. The gradient snaps in; only opacity animates. These selectors
// use `not-disabled` rather than `enabled` so buttons rendered as links keep
// their hover and press states.
export const overlayOnDark =
  "not-disabled:hover:bg-[linear-gradient(rgba(255,255,255,0.1),rgba(255,255,255,0.1))] not-disabled:active:bg-[linear-gradient(rgba(255,255,255,0.2),rgba(255,255,255,0.2))]";

export const overlayOnLight =
  "not-disabled:hover:bg-[linear-gradient(rgba(0,0,0,0.06),rgba(0,0,0,0.06))] not-disabled:active:bg-[linear-gradient(rgba(0,0,0,0.12),rgba(0,0,0,0.12))]";

export const overlayOnLightSoft =
  "enabled:hover:bg-[linear-gradient(rgba(0,0,0,0.04),rgba(0,0,0,0.04))] enabled:active:bg-[linear-gradient(rgba(0,0,0,0.04),rgba(0,0,0,0.04))]";

export const overlayOnBlue12 =
  "enabled:hover:bg-[linear-gradient(rgba(0,0,0,0.12),rgba(0,0,0,0.12))] enabled:active:bg-[linear-gradient(rgba(0,0,0,0.12),rgba(0,0,0,0.12))]";

export const ghostFade = "not-disabled:hover:opacity-80 not-disabled:active:opacity-60";

// The 1px border plus a 1px inset ring reads as a 2px border. (An inset `outline` would be
// hidden by `outline-none`, which sets --tw-outline-style to none in Tailwind 4.)
export const fieldBox = "flex w-full rounded border transition-shadow";

export function fieldBoxState(error?: boolean) {
  return error
    ? "border-red-600 bg-red-50 inset-ring inset-ring-red-600 focus-within:ring-4 focus-within:ring-blue-primary/25"
    : "border-gray-300 bg-gray-0 focus-within:border-blue-primary focus-within:inset-ring focus-within:inset-ring-blue-primary focus-within:ring-4 focus-within:ring-blue-primary/25";
}
