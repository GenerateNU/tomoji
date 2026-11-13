import { ComponentDocPage } from "@/features/design-system/components/docs/component-doc-page";
import { MenuExamples } from "@/features/design-system/examples/menu";
import { docMetadata } from "@/features/design-system/lib/registry";

export const metadata = docMetadata("menu");

export default function Page() {
  return (
    <ComponentDocPage
      slug="menu"
      importCode={`import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuCheckboxItem,
  DropdownMenuSectionLabel,
  DropdownMenuSeparator,
  DropdownMenuFooter,
} from "@/components/ui/dropdown-menu";`}
      examples={<MenuExamples />}
      usage={{
        whenToUse: [
          "Overflow (···) and right-click menus with actions like Copy, Edit and Delete.",
          "Single-choice lists such as Sort by, with a radio item on the current option.",
          "Multi-select filter lists with checkbox items and a footer holding the count and Clear / Done.",
        ],
        do: [
          "Group related items under a DropdownMenuSectionLabel and separate groups with a DropdownMenuSeparator.",
          'Put destructive actions last, after a divider, with variant="destructive".',
          "Use chevron for items that open a sub-menu or a further filter view.",
        ],
        dont: [
          "Don't mix icons and no-icons within one group.",
          "Don't use a menu for primary navigation — that's the sidebar or tabs.",
        ],
      }}
      props={[
        {
          component: "DropdownMenuContent",
          rows: [
            {
              name: "children",
              type: "ReactNode",
              description:
                "DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSectionLabel and DropdownMenuFooter.",
            },
            {
              name: "side",
              type: '"top" | "right" | "bottom" | "left"',
              default: '"bottom"',
              description: "Which side of the trigger the panel opens on.",
            },
            {
              name: "align",
              type: '"start" | "center" | "end"',
              default: '"start"',
              description: "Alignment against the trigger.",
            },
            {
              name: "sideOffset",
              type: "number",
              default: "4",
              description: "Gap between the trigger and the panel, in px.",
            },
            {
              name: "className",
              type: "string",
              description: "Width is 200px (min-w-50) by default; override for wider menus.",
            },
          ],
        },
        {
          component: "DropdownMenuItem",
          rows: [
            { name: "children", type: "ReactNode", description: "Item text, 16px." },
            {
              name: "icon",
              type: "IconComponent",
              description: "Leading Remix icon, e.g. RiPencilLine.",
            },
            {
              name: "variant",
              type: '"default" | "destructive"',
              default: '"default"',
              description: "Destructive is red with a red-50 highlight.",
            },
            {
              name: "chevron",
              type: "boolean",
              default: "false",
              description: "Trailing chevron for sub-menus.",
            },
            {
              name: "disabled",
              type: "boolean",
              default: "false",
              description: "Fades the item to 40%.",
            },
            {
              name: "onClick",
              type: "() => void",
              description: "Called when the item is chosen.",
            },
          ],
        },
        {
          component: "DropdownMenuRadioItem / DropdownMenuCheckboxItem",
          rows: [
            {
              name: "value",
              type: "string",
              description:
                "Radio items: the value inside DropdownMenuRadioGroup. A blue check trails the chosen item.",
            },
            {
              name: "checked / onCheckedChange",
              type: "boolean / (checked: boolean) => void",
              description: "Checkbox items: a leading checkbox. Choosing one keeps the menu open.",
            },
          ],
        },
        {
          component: "DropdownMenuSectionLabel / DropdownMenuFooter",
          rows: [
            {
              name: "children",
              type: "ReactNode",
              description:
                "Section label: uppercase 12px gray heading. Footer: a row under a divider, e.g. a count and Clear / Done buttons.",
            },
          ],
        },
      ]}
      names={[
        "menu",
        "dropdown",
        "dropdown menu",
        "context menu",
        "overflow menu",
        "more menu",
        "popover menu",
        "action menu",
        "sort menu",
        "filter menu",
        "multi-select list",
      ]}
    />
  );
}
