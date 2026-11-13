import type { Metadata } from "next";

export const FOUNDATION_SLUGS = ["colors", "typography", "icons", "spacing-radius"] as const;

export const COMPONENT_SLUGS = [
  "button",
  "brand-button",
  "countdown-button",
  "text-field",
  "text-area",
  "menu",
  "checkbox",
  "switch",
  "tag",
  "select",
  "filter-chip",
  "icon-container",
  "toast",
  "modal",
  "stepper",
  "avatar",
  "breadcrumbs",
  "tabs",
  "segmented-control",
  "sidebar",
  "logo",
  "activity-item",
  "table",
  "pagination",
  "progress-ring",
  "banner",
  "skeleton",
  "spinner",
  "assignment-row",
  "selectable-card",
  "stat-tile",
  "chart",
  "bar-list",
  "heatmap",
] as const;

export type FoundationSlug = (typeof FOUNDATION_SLUGS)[number];
export type ComponentSlug = (typeof COMPONENT_SLUGS)[number];

export type FigmaNode = { label: string; nodeId: string };

export type DocEntry = {
  slug: string;
  name: string;
  href: string;
  summary: string;
  figma?: FigmaNode[];
};

export const INTRODUCTION: DocEntry = {
  slug: "introduction",
  name: "Introduction",
  href: "/design-system",
  summary:
    "The Tomoji components, mirrored from the Figma style guide: Host Grotesk, the gray, blue, mint and red color tokens, Tailwind's spacing and radius scales, and Remix icons. Components live in src/components, and each page here documents one.",
};

export const FOUNDATIONS: DocEntry[] = [
  {
    slug: "colors",
    name: "Colors",
    href: "/design-system/foundations/colors",
    summary:
      "Blue for primary actions and selection, mint held in reserve for a premium product or tier, a cool gray scale for text and surfaces, and red for errors and destructive actions. Each swatch is a Tailwind class like bg-blue-primary or text-gray-500, matching the Figma Hi-fi variables.",
  },
  {
    slug: "typography",
    name: "Typography",
    href: "/design-system/foundations/typography",
    summary:
      "Everything is set in Host Grotesk with stylistic set 2 turned on, which swaps in the single-storey lowercase a.",
  },
  {
    slug: "icons",
    name: "Icons",
    href: "/design-system/foundations/icons",
    summary:
      "Tomoji uses Remix Icon, the ri- set in the Figma Icons page. Draw icons at 16px (24px in large surfaces), colored to match the text next to them. Use the Line style by default and the Fill style for selected or emphasized states.",
  },
  {
    slug: "spacing-radius",
    name: "Spacing & Radius",
    href: "/design-system/foundations/spacing-radius",
    summary:
      "The Figma spacing-N and radius-N variables, where N is pixels. They line up with Tailwind's own scales, so use the matching class: spacing-12 is p-3 or gap-3, radius-8 is rounded-lg.",
  },
];

export const COMPONENTS: DocEntry[] = [
  {
    slug: "button",
    name: "Button",
    href: "/design-system/components/button",
    summary:
      "Rounded-rectangle actions in Host Grotesk: blue primary, black secondary and red destructive, each in solid, subtle or ghost weight, plus a mint special button held in reserve for a premium tier.",
    figma: [{ label: "Button", nodeId: "5351:1096" }],
  },
  {
    slug: "brand-button",
    name: "Brand Button",
    href: "/design-system/components/brand-button",
    summary:
      "Buttons for third-party services — Stripe, X, Google and Apple — in blue primary, gray secondary-subtle or black secondary, with the brand mark and an optional external-link icon.",
    figma: [{ label: "Brand Button", nodeId: "5492:2302" }],
  },
  {
    slug: "countdown-button",
    name: "Countdown Button",
    href: "/design-system/components/countdown-button",
    summary:
      "A primary button with a real timer: a solid blue fill grows across a faded blue track over a few seconds, the remaining seconds count down after the label, then onComplete fires.",
    figma: [{ label: "Countdown Button", nodeId: "5494:2292" }],
  },
  {
    slug: "text-field",
    name: "Text Field",
    href: "/design-system/components/text-field",
    summary:
      "A labelled single-line input with a 4px-rounded box that turns blue with a soft ring on focus and red with a message on error.",
    figma: [{ label: "Text Field", nodeId: "5369:3548" }],
  },
  {
    slug: "text-area",
    name: "Text Area",
    href: "/design-system/components/text-area",
    summary:
      "A labelled multi-line input, 120px tall by default, with optional required marker, helper text and a character counter.",
    figma: [{ label: "Text Area", nodeId: "5422:838" }],
  },
  {
    slug: "menu",
    name: "Menu",
    href: "/design-system/components/menu",
    summary:
      "A white floating panel of 16px items with optional icons, a blue check for the chosen option, checkboxes for multi-select, chevrons for sub-menus, uppercase section labels, dividers and an optional footer row.",
    figma: [
      { label: "Menu", nodeId: "5424:779" },
      { label: "Menu Item", nodeId: "5424:774" },
      { label: "Menu Divider", nodeId: "5424:775" },
      { label: "Section Label", nodeId: "5424:777" },
    ],
  },
  {
    slug: "checkbox",
    name: "Checkbox",
    href: "/design-system/components/checkbox",
    summary:
      "A 16px box with a 2px radius: gray outline when off, filled blue-primary with a white check when on, and a white dash when indeterminate.",
    figma: [{ label: "Checkbox", nodeId: "5426:822" }],
  },
  {
    slug: "switch",
    name: "Switch",
    href: "/design-system/components/switch",
    summary: "A 48 × 28 pill toggle: gray-300 when off, blue-primary when on, with a white thumb.",
    figma: [{ label: "Switch", nodeId: "5430:876" }],
  },
  {
    slug: "tag",
    name: "Tag",
    href: "/design-system/components/tag",
    summary:
      "A small 4px-rounded label in neutral gray, primary blue or destructive red, with an optional icon and remove button.",
    figma: [{ label: "Tag", nodeId: "5434:941" }],
  },
  {
    slug: "select",
    name: "Select",
    href: "/design-system/components/select",
    summary:
      "A labelled dropdown field. Single select opens a Menu of options; multi-select shows chosen values as removable Tags and opens a searchable checkbox Menu with Clear / Done.",
    figma: [{ label: "Select", nodeId: "5437:981" }],
  },
  {
    slug: "filter-chip",
    name: "Filter Chip",
    href: "/design-system/components/filter-chip",
    summary:
      "A pill-shaped toggle for quick filters: white with a gray-200 border, or filled blue-primary when selected, with an optional icon and count.",
    figma: [{ label: "Filter Chip", nodeId: "5439:1137" }],
  },
  {
    slug: "icon-container",
    name: "Icon Container",
    href: "/design-system/components/icon-container",
    summary:
      "A 28px tinted square holding a 16px icon: blue for success, gray for neutral, red for errors.",
    figma: [{ label: "Icon Container", nodeId: "5447:1115" }],
  },
  {
    slug: "toast",
    name: "Toast",
    href: "/design-system/components/toast",
    summary:
      "A white floating confirmation: a tinted icon, a sentence with the affected item in black medium, an optional small action button and a close ×.",
    figma: [{ label: "Toast", nodeId: "5447:1122" }],
  },
  {
    slug: "modal",
    name: "Modal",
    href: "/design-system/components/modal",
    summary:
      "A white dialog over a dimmed page: title and close button on top, any content in the middle, actions bottom right. Small (18px) or big (28px) title, optional breadcrumbs above the title and extra header controls next to close.",
    figma: [{ label: "Modal", nodeId: "5628:5416" }],
  },
  {
    slug: "stepper",
    name: "Stepper",
    href: "/design-system/components/stepper",
    summary:
      "A segmented progress bar for multi-step flows: blue bars for complete and current steps, gray for upcoming, with a check on completed labels.",
    figma: [
      { label: "Stepper", nodeId: "5451:1185" },
      { label: "Step", nodeId: "5451:1180" },
    ],
  },
  {
    slug: "avatar",
    name: "Avatar",
    href: "/design-system/components/avatar",
    summary:
      "People are circles (blue initials, a photo, or a gray user placeholder); companies are rounded squares (gray initials, a logo, or a building placeholder). AvatarLabel pairs an avatar with a name.",
    figma: [
      { label: "Avatar", nodeId: "5453:1273" },
      { label: "Company Avatar", nodeId: "5453:1289" },
      { label: "Avatar Label", nodeId: "5453:1316" },
    ],
  },
  {
    slug: "breadcrumbs",
    name: "Breadcrumbs",
    href: "/design-system/components/breadcrumbs",
    summary:
      "A location trail of gray links separated by light slashes. The last item is the current page in black medium; any item can lead with an avatar.",
    figma: [
      { label: "Breadcrumbs", nodeId: "5457:1327" },
      { label: "Breadcrumb Item", nodeId: "5457:1319" },
      { label: "Breadcrumb Separator", nodeId: "5457:1324" },
    ],
  },
  {
    slug: "tabs",
    name: "Tabs",
    href: "/design-system/components/tabs",
    summary:
      "Underline tabs on a full-width gray rule. The selected tab is black medium with a 3px blue underline; hover darkens the label. Optional counts sit after the label.",
    figma: [
      { label: "Tabs", nodeId: "5459:1371" },
      { label: "Tab", nodeId: "5459:1366" },
    ],
  },
  {
    slug: "segmented-control",
    name: "Segmented Control",
    href: "/design-system/components/segmented-control",
    summary:
      "A gray-50 track of segments where the selected one is a white raised pill. Text segments switch statuses or ranges; icon segments switch views.",
    figma: [
      { label: "Segment", nodeId: "5462:1413" },
      { label: "Segmented Control", nodeId: "5462:1419" },
    ],
  },
  {
    slug: "sidebar",
    name: "Sidebar",
    href: "/design-system/components/sidebar",
    summary:
      "Full-height product navigation on a gray-10 background, next to a white SidebarPage with the shadow-page drop shadow. Items show a 3px blue left bar and a filled icon when selected. The creator sidebar has the ohani logo; the company sidebar has the company, and a campaign panel inside a campaign.",
    figma: [
      { label: "Sidebar Item", nodeId: "5465:1446" },
      { label: "Creator Sidebar", nodeId: "5470:1646" },
      { label: "Company Sidebar", nodeId: "5469:1734" },
    ],
  },
  {
    slug: "logo",
    name: "Logo",
    href: "/design-system/components/logo",
    summary:
      "The [ohani] wordmark and the [o] mark as inline SVG in currentColor, at fixed heights from 16 to 128px with the brackets optically centered.",
    figma: [{ label: "Logo", nodeId: "5472:1636" }],
  },
  {
    slug: "activity-item",
    name: "Activity Item",
    href: "/design-system/components/activity-item",
    summary:
      "One entry in a notifications or activity feed: an icon container, title, description and timestamp, tinted blue when unread and red when it needs attention.",
    figma: [{ label: "Activity Item", nodeId: "5480:1660" }],
  },
  {
    slug: "table",
    name: "Table",
    href: "/design-system/components/table",
    summary:
      "A white card holding a semantic table: optional title and count, gray sortable headers, and text, avatar or custom cells separated by a 20px column gap.",
    figma: [
      { label: "Table", nodeId: "5485:1771" },
      { label: "Table Header", nodeId: "5485:1726" },
      { label: "Table Header Cell", nodeId: "5484:1751" },
      { label: "Table Row", nodeId: "5485:1750" },
      { label: "Table Cell", nodeId: "5484:1773" },
      { label: "Sort Icon", nodeId: "5484:1732" },
    ],
  },
  {
    slug: "pagination",
    name: "Pagination",
    href: "/design-system/components/pagination",
    summary:
      "Round 32px page buttons with prev / next arrows; the current page sits on a gray-50 circle and skipped pages collapse into an ellipsis.",
    figma: [
      { label: "Pagination Item", nodeId: "5490:2209" },
      { label: "Pagination", nodeId: "5490:2217" },
    ],
  },
  {
    slug: "progress-ring",
    name: "Progress Ring",
    href: "/design-system/components/progress-ring",
    summary:
      "A gray ring that fills blue clockwise from the top for any 0–100 value, with the percentage in the middle.",
    figma: [{ label: "Progress Ring", nodeId: "5491:2305" }],
  },
  {
    slug: "banner",
    name: "Banner",
    href: "/design-system/components/banner",
    summary:
      "A full-width tinted strip with an icon, a 14px message, an optional Small ghost Button action and a close ×. Blue for good news, gray for information, red for problems.",
    figma: [{ label: "Banner", nodeId: "5495:2295" }],
  },
  {
    slug: "skeleton",
    name: "Skeleton",
    href: "/design-system/components/skeleton",
    summary:
      "Placeholder blocks drawn as a grid of 7px gray rectangles, with a wave rolling through them while content loads. Every skeleton on the page shares one wave.",
  },
  {
    slug: "spinner",
    name: "Spinner",
    href: "/design-system/components/spinner",
    summary:
      "The [o] mark in gray-300 with the brackets turning a half turn at a time around a still o, with a gentle ease and a short rest, for waits of unknown length.",
  },
  {
    slug: "assignment-row",
    name: "Assignment Row",
    href: "/design-system/components/assignment-row",
    summary:
      "A clickable white row for one assignment: a status icon, a truncated title and a tag with the due date or status.",
    figma: [{ label: "Assignment Row", nodeId: "5495:2395" }],
  },
  {
    slug: "selectable-card",
    name: "Selectable Card",
    href: "/design-system/components/selectable-card",
    summary:
      "A full-width white card with a checkbox, title and description; selected cards turn blue-subtle with a blue-primary outline.",
    figma: [{ label: "Selectable Card", nodeId: "5496:2380" }],
  },
  {
    slug: "stat-tile",
    name: "Stat Tile",
    href: "/design-system/components/stat-tile",
    summary:
      "A white tile with a gray icon-and-label and a large value, optionally with a small trend tag.",
    figma: [{ label: "Stat Tile", nodeId: "5497:2408" }],
  },
  {
    slug: "chart",
    name: "Chart",
    href: "/design-system/components/chart",
    summary:
      "A white chart card drawn in SVG from data: a blue area line with a Today marker and a dashed gray projection (optionally against a gray comparison line), or blue bars, with a legend and gray axis labels. Hover, or focus the plot and use the arrow keys, for a crosshair or bar tooltip.",
    figma: [
      { label: "Chart", nodeId: "5498:2491" },
      { label: "Legend Item", nodeId: "5498:2428" },
      { label: "Chart Tooltip", nodeId: "5524:2720" },
    ],
  },
  {
    slug: "bar-list",
    name: "Bar List",
    href: "/design-system/components/bar-list",
    summary:
      "Horizontal ranked bars in a white card: a label, a blue bar and the value at its tip. Hover or focus a row for its share of the total; highlight one row to make it the story.",
    figma: [
      { label: "Bar List", nodeId: "5525:2723" },
      { label: "Bar List Row", nodeId: "5525:2722" },
    ],
  },
  {
    slug: "heatmap",
    name: "Heatmap",
    href: "/design-system/components/heatmap",
    summary:
      "A grid of cells on one blue scale, darker for more, with a Less → More key. Hover a cell, or focus the grid and use the arrow keys, for its value.",
    figma: [
      { label: "Heatmap", nodeId: "5526:2752" },
      { label: "Heatmap Cell", nodeId: "5526:2751" },
    ],
  },
];

export function getFoundation(slug: FoundationSlug): DocEntry {
  const entry = FOUNDATIONS.find((item) => item.slug === slug);
  if (!entry) throw new Error(`Unknown foundation: ${slug}`);
  return entry;
}

export function getComponent(slug: ComponentSlug): DocEntry {
  const entry = COMPONENTS.find((item) => item.slug === slug);
  if (!entry) throw new Error(`Unknown component: ${slug}`);
  return entry;
}

export function docMetadata(slug: FoundationSlug | ComponentSlug): Metadata {
  const entry = [...FOUNDATIONS, ...COMPONENTS].find((item) => item.slug === slug);
  if (!entry) throw new Error(`Unknown doc page: ${slug}`);
  return { title: entry.name, description: entry.summary };
}
