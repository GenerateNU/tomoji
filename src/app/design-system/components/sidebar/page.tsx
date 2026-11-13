import { ComponentDocPage } from "@/features/design-system/components/docs/component-doc-page";
import { SidebarExamples } from "@/features/design-system/examples/sidebar";
import { docMetadata } from "@/features/design-system/lib/registry";

export const metadata = docMetadata("sidebar");

export default function Page() {
  return (
    <ComponentDocPage
      slug="sidebar"
      importCode={[
        "import {",
        "  Sidebar, SidebarContent, SidebarHeader, SidebarToggle, SidebarLabel, SidebarNav,",
        "  SidebarItem, SidebarFooter, SidebarAccount, SidebarGroup, SidebarPanel, SidebarPage,",
        '} from "@/components/ui/sidebar";',
      ].join("\n")}
      examples={<SidebarExamples />}
      usage={{
        whenToUse: [
          "A Sidebar on every creator and company app screen: the creator one has the ohani logo, the company one has the company.",
          "SidebarGroup with a collapsed Sidebar and a SidebarPanel inside a campaign workspace, with the panel open or collapsed.",
          "SidebarPage for the main container beside any sidebar, so it always carries the page drop shadow.",
        ],
        do: [
          "Keep the nav items fixed — set which one is active.",
          "Collapse to the 56px rail on narrow screens.",
        ],
        dont: [
          "Don't add custom items to the product navs; build a new sidebar from SidebarItem if you need one.",
        ],
      }}
      props={[
        {
          component: "Sidebar",
          rows: [
            {
              name: "collapsed",
              type: "boolean",
              default: "false",
              description:
                "56px rail. Hovering peeks it open after 100ms; keyboard focus or an open account menu also opens it. Labels stay in the markup for screen readers.",
            },
            {
              name: "peek",
              type: '"page" | "panel"',
              default: '"page"',
              description:
                "How wide a collapsed rail peeks: 200px, or 176px beside a SidebarPanel.",
            },
            {
              name: "className",
              type: "string",
              description: "Merged onto the aside, e.g. a border for a rail.",
            },
          ],
        },
        {
          component: "SidebarItem",
          rows: [
            {
              name: "icon",
              type: "ReactNode",
              description: "A 16px Remix Line icon.",
            },
            {
              name: "activeIcon",
              type: "ReactNode",
              description: "Remix Fill icon shown instead of icon while active.",
            },
            {
              name: "active",
              type: 'boolean | "parent"',
              default: "false",
              description:
                'Blue left bar, black medium label (aria-current="page"). "parent" keeps the same label but uses a gray bar, for the rail beside an open panel.',
            },
            {
              name: "badge",
              type: "ReactNode",
              description: "Blue count pill.",
            },
            {
              name: "render",
              type: "ReactElement",
              description: 'Renders another element, e.g. <Link href="..." />. Items are links.',
            },
          ],
        },
        {
          component: "SidebarToggle",
          rows: [
            {
              name: "onCollapsedChange",
              type: "(collapsed: boolean) => void",
              description:
                'Fold button (true) and the unfold button shown while peeking (false). Labelled "Collapse sidebar" or "Expand sidebar".',
            },
          ],
        },
        {
          component: "SidebarAccount",
          rows: [
            {
              name: "avatar",
              type: "ReactNode",
              description: "Usually a 24px Avatar.",
            },
            {
              name: "children",
              type: "string",
              description: "The account name.",
            },
            {
              name: "render",
              type: "ReactElement",
              description:
                "Pass SidebarAccount to a DropdownMenuTrigger to open View profile and Settings above it.",
            },
          ],
        },
        {
          component: "SidebarPanel",
          rows: [
            {
              name: "open",
              type: "boolean",
              default: "true",
              description:
                "176px beside a collapsed Sidebar inside a SidebarGroup; closing animates the width to 0 and makes it inert. It narrows while the rail peeks.",
            },
          ],
        },
        {
          component: "SidebarPage",
          rows: [
            {
              name: "className",
              type: "string",
              description:
                'Padding and layout for the page content, e.g. "flex flex-col gap-6 p-8". Renders a white main with the page shadow.',
            },
          ],
        },
        {
          component:
            "SidebarContent / SidebarHeader / SidebarNav / SidebarFooter / SidebarLabel / SidebarGroup",
          rows: [
            {
              name: "className",
              type: "string",
              description:
                "Layout pieces. Content groups the header and nav above a pinned footer; Nav needs an aria-label when a page has more than one; Label fades with the sidebar's labels; Group wraps a rail and its panel.",
            },
          ],
        },
      ]}
      names={[
        "sidebar",
        "side nav",
        "navigation",
        "nav",
        "left nav",
        "rail",
        "app navigation",
        "menu bar",
      ]}
    />
  );
}
