import { cn } from "@/lib/utils";
import { PreviewSection } from "./preview-section";

// Each role names the semantic token components should use, and the Figma
// swatch it resolves to.
const COLOR_ROLES = [
  { token: "bg-background", swatch: "white", use: "Page and panel background" },
  { token: "bg-foreground", swatch: "neutral-950", use: "Primary text" },
  { token: "bg-primary", swatch: "neutral-950", use: "Primary buttons, selected states" },
  { token: "bg-muted-foreground", swatch: "neutral-500", use: "Secondary and helper text" },
  { token: "bg-input", swatch: "neutral-300", use: "Input borders" },
  { token: "bg-secondary", swatch: "neutral-200", use: "Secondary buttons" },
  { token: "bg-border", swatch: "neutral-200", use: "Hairline borders, dividers" },
  { token: "bg-muted", swatch: "neutral-100", use: "Surfaces, hover rows, tags" },
  { token: "bg-destructive", swatch: "red-600", use: "Destructive buttons, errors" },
];

// Full class names, so Tailwind's scanner finds them.
const HEADINGS = [
  "text-heading-xxl",
  "text-heading-xl",
  "text-heading-lg",
  "text-heading-md",
  "text-heading-sm",
];

const BODY_SIZES = ["text-body-lg", "text-body", "text-body-sm", "text-body-xs"];

const BODY_WEIGHTS = [
  { name: "default", className: "font-normal" },
  { name: "medium", className: "font-medium" },
  { name: "strong", className: "font-semibold" },
];

const RADII = [
  { className: "rounded-sm", size: "4px", use: "Sidebar items, checkboxes" },
  { className: "rounded-md", size: "6px", use: "Menu items, segments" },
  { className: "rounded-lg", size: "8px", use: "Buttons, inputs, selects" },
  { className: "rounded-xl", size: "12px", use: "Menus, toasts" },
  { className: "rounded-2xl", size: "16px", use: "Cards and panels" },
  { className: "rounded-full", size: "pill", use: "Tags, chips, switches, avatars" },
];

export function ColorPreview() {
  return (
    <PreviewSection
      id="colors"
      title="Colors"
      description="Neutral throughout, with red kept for destructive actions and errors. Use the semantic token, not the raw swatch, so components stay consistent."
    >
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {COLOR_ROLES.map((role) => (
          <li key={role.token} className="flex items-center gap-3">
            <span className={cn("size-10 shrink-0 rounded-lg border", role.token)} />
            <div className="min-w-0">
              <p className="text-body-sm font-medium">{role.token}</p>
              <p className="text-body-xs text-muted-foreground">
                {role.swatch} · {role.use}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </PreviewSection>
  );
}

export function TypographyPreview() {
  return (
    <PreviewSection
      id="typography"
      title="Typography"
      description="Inter throughout. Headings are medium weight. Body sizes pair with font-normal, font-medium or font-semibold for the default, medium and strong styles."
    >
      <div className="space-y-4">
        {HEADINGS.map((style) => (
          <div key={style} className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
            <code className="w-36 shrink-0 text-body-xs text-muted-foreground">{style}</code>
            <p className={style}>Find your next campaign</p>
          </div>
        ))}
      </div>
      <div className="space-y-4">
        {BODY_SIZES.map((size) => (
          <div key={size} className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
            <code className="w-36 shrink-0 text-body-xs text-muted-foreground">{size}</code>
            {BODY_WEIGHTS.map((weight) => (
              <p key={weight.name} className={cn(size, weight.className)}>
                {weight.name}
              </p>
            ))}
          </div>
        ))}
      </div>
    </PreviewSection>
  );
}

export function RadiusPreview() {
  return (
    <PreviewSection
      id="radius-elevation"
      title="Radius & elevation"
      description="Rounder corners for bigger surfaces. The overlay shadow is only for things that float above the page."
    >
      <ul className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-6">
        {RADII.map((radius) => (
          <li key={radius.className} className="space-y-2">
            <div className={cn("h-16 border bg-muted", radius.className)} />
            <p className="text-body-sm font-medium">{radius.className}</p>
            <p className="text-body-xs text-muted-foreground">
              {radius.size} · {radius.use}
            </p>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-6">
        <div className="w-48 space-y-2">
          <div className="h-16 rounded-xl bg-background shadow-overlay" />
          <p className="text-body-sm font-medium">shadow-overlay</p>
          <p className="text-body-xs text-muted-foreground">Menus, dropdowns, toasts</p>
        </div>
        <div className="w-48 space-y-2">
          <div className="h-16 rounded-xl border bg-background" />
          <p className="text-body-sm font-medium">border</p>
          <p className="text-body-xs text-muted-foreground">Cards on the page</p>
        </div>
      </div>
    </PreviewSection>
  );
}
