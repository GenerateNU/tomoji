import { DocSection } from "@/features/design-system/components/docs/section";

const SPACING = [
  { px: 2, utility: "0.5" },
  { px: 4, utility: "1" },
  { px: 6, utility: "1.5" },
  { px: 8, utility: "2" },
  { px: 12, utility: "3" },
  { px: 16, utility: "4" },
  { px: 20, utility: "5" },
  { px: 24, utility: "6" },
  { px: 32, utility: "8" },
  { px: 40, utility: "10" },
  { px: 48, utility: "12" },
  { px: 64, utility: "16" },
];

const RADII = [
  { name: "radius-2", utility: "rounded-xs", className: "rounded-xs" },
  { name: "radius-4", utility: "rounded", className: "rounded" },
  { name: "radius-6", utility: "rounded-md", className: "rounded-md" },
  { name: "radius-8", utility: "rounded-lg", className: "rounded-lg" },
  { name: "radius-12", utility: "rounded-xl", className: "rounded-xl" },
  { name: "radius-16", utility: "rounded-2xl", className: "rounded-2xl" },
  { name: "radius-full", utility: "rounded-full", className: "rounded-full" },
];

export function SpacingRadiusFoundation() {
  return (
    <>
      <DocSection
        title="Spacing"
        description="Padding and gaps in every Tomoji component use this scale."
      >
        <div className="divide-y divide-gray-100 rounded-lg border border-gray-100">
          {SPACING.map(({ px, utility }) => (
            <div key={px} className="grid grid-cols-[120px_1fr_140px] items-center gap-4 px-5 py-3">
              <span className="font-mono text-code-lg">spacing-{px}</span>
              <span
                aria-hidden="true"
                className="h-3 rounded-xs bg-blue-primary"
                style={{ width: px }}
              />
              <span className="text-right font-mono text-body-xs text-gray-400">
                {px} px · p-{utility}
              </span>
            </div>
          ))}
        </div>
      </DocSection>
      <DocSection
        title="Radius"
        description="radius-4 for controls (buttons, inputs, menu items), radius-8 for cards and menus, radius-full for pills and avatars."
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {RADII.map((radius) => (
            <div
              key={radius.name}
              className="flex flex-col items-center gap-2.5 rounded-lg border border-gray-100 px-2 py-4"
            >
              <div
                aria-hidden="true"
                className={`size-12 border-2 border-gray-950 bg-gray-50 ${radius.className}`}
              />
              <span className="font-mono text-body-xs">{radius.name}</span>
              <span className="font-mono text-[11px] text-gray-400">{radius.utility}</span>
            </div>
          ))}
        </div>
      </DocSection>
      <DocSection
        title="Elevation"
        description="One shadow, the Figma effect style Shadow/Overlay, for floating surfaces: menus, toasts, popovers."
      >
        <div className="flex items-center justify-center rounded-lg border border-gray-100 bg-gray-25 p-10">
          <div className="rounded-lg bg-gray-0 px-6 py-4 font-mono text-body-xs shadow-overlay">
            shadow-overlay
          </div>
        </div>
      </DocSection>
    </>
  );
}
