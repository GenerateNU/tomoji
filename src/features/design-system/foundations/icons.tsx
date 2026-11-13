import {
  RiAddLine,
  RiAppleFill,
  RiArrowDownSLine,
  RiArrowLeftLine,
  RiArrowLeftSLine,
  RiArrowRightLine,
  RiArrowRightSLine,
  RiAuctionLine,
  RiBarChartBoxLine,
  RiBriefcaseLine,
  RiBuilding2Fill,
  RiChat3Line,
  RiCheckboxCircleLine,
  RiCheckboxMultipleLine,
  RiCheckLine,
  RiCloseLine,
  RiDeleteBinLine,
  RiErrorWarningLine,
  RiExpandUpDownLine,
  RiExternalLinkLine,
  RiEyeLine,
  RiFileCopyLine,
  RiFolderLine,
  RiFunctionLine,
  RiGroupLine,
  RiHeartLine,
  RiHome4Line,
  RiInboxLine,
  RiInformationLine,
  RiLayoutGridLine,
  RiListUnordered,
  RiMoreLine,
  RiNotification3Line,
  RiPencilLine,
  RiProgress1Line,
  RiSearchLine,
  RiSettings3Line,
  RiSidebarFoldLine,
  RiStarLine,
  RiThumbUpLine,
  RiTimeLine,
  RiTwitterXLine,
  RiUser3Fill,
  RiVideoLine,
  RiVidiconLine,
  RiWallet3Line,
} from "@remixicon/react";
import { CodeBlock } from "@/features/design-system/components/docs/code-block";
import { DocSection } from "@/features/design-system/components/docs/section";
import { iconProps, type IconComponent } from "@/lib/icons";

const GROUPS: { title: string; icons: { name: string; icon: IconComponent }[] }[] = [
  {
    title: "Navigation",
    icons: [
      { name: "ri-home-4", icon: RiHome4Line },
      { name: "ri-search", icon: RiSearchLine },
      { name: "ri-folder", icon: RiFolderLine },
      { name: "ri-inbox", icon: RiInboxLine },
      { name: "ri-checkbox-multiple", icon: RiCheckboxMultipleLine },
      { name: "ri-video", icon: RiVideoLine },
      { name: "ri-wallet-3", icon: RiWallet3Line },
      { name: "ri-auction", icon: RiAuctionLine },
      { name: "ri-bar-chart-box", icon: RiBarChartBoxLine },
      { name: "ri-layout-grid", icon: RiLayoutGridLine },
      { name: "ri-briefcase", icon: RiBriefcaseLine },
      { name: "ri-group", icon: RiGroupLine },
      { name: "ri-settings-3", icon: RiSettings3Line },
      { name: "ri-sidebar-fold", icon: RiSidebarFoldLine },
      { name: "ri-notification-3", icon: RiNotification3Line },
    ],
  },
  {
    title: "Actions",
    icons: [
      { name: "ri-add", icon: RiAddLine },
      { name: "ri-pencil", icon: RiPencilLine },
      { name: "ri-file-copy", icon: RiFileCopyLine },
      { name: "ri-delete-bin", icon: RiDeleteBinLine },
      { name: "ri-close", icon: RiCloseLine },
      { name: "ri-check", icon: RiCheckLine },
      { name: "ri-more", icon: RiMoreLine },
      { name: "ri-star", icon: RiStarLine },
      { name: "ri-external-link", icon: RiExternalLinkLine },
      { name: "ri-arrow-right", icon: RiArrowRightLine },
      { name: "ri-arrow-left", icon: RiArrowLeftLine },
    ],
  },
  {
    title: "Controls & status",
    icons: [
      { name: "ri-arrow-down-s", icon: RiArrowDownSLine },
      { name: "ri-arrow-right-s", icon: RiArrowRightSLine },
      { name: "ri-arrow-left-s", icon: RiArrowLeftSLine },
      { name: "ri-expand-up-down", icon: RiExpandUpDownLine },
      { name: "ri-function", icon: RiFunctionLine },
      { name: "ri-list-unordered", icon: RiListUnordered },
      { name: "ri-checkbox-circle", icon: RiCheckboxCircleLine },
      { name: "ri-error-warning", icon: RiErrorWarningLine },
      { name: "ri-information", icon: RiInformationLine },
      { name: "ri-progress-1", icon: RiProgress1Line },
      { name: "ri-time", icon: RiTimeLine },
      { name: "ri-thumb-up", icon: RiThumbUpLine },
      { name: "ri-vidicon", icon: RiVidiconLine },
      { name: "ri-eye", icon: RiEyeLine },
      { name: "ri-heart", icon: RiHeartLine },
      { name: "ri-chat-3", icon: RiChat3Line },
    ],
  },
  {
    title: "Avatars & brands",
    icons: [
      { name: "ri-user-3 (fill)", icon: RiUser3Fill },
      { name: "ri-building-2 (fill)", icon: RiBuilding2Fill },
      { name: "ri-twitter-x", icon: RiTwitterXLine },
      { name: "ri-apple (fill)", icon: RiAppleFill },
    ],
  },
];

const CODE = `import { RiAddLine, RiArrowRightLine } from "@remixicon/react";
import { Button } from "@/components/ui/button";

<RiAddLine size={16} />

// Components take the icon itself, not an element:
<Button icon={RiAddLine}>Create campaign</Button>
<Button variant="secondary" trailingIcon={RiArrowRightLine}>Next</Button>`;

export function IconsFoundation() {
  return (
    <>
      <DocSection title="In code">
        <CodeBlock tone="import" code={CODE} />
        <p className="mt-3 text-body-sm text-gray-500">
          Figma names map to components by camel-casing the name and adding the style:
          ri-arrow-right-s (Line) is{" "}
          <code className="font-mono text-code-lg">RiArrowRightSLine</code>, ri-star (Fill) is{" "}
          <code className="font-mono text-code-lg">RiStarFill</code>. Browse the full set at{" "}
          <a href="https://remixicon.com" className="font-medium text-blue-primary hover:underline">
            remixicon.com
          </a>
          ; these are the ones the Tomoji components use.
        </p>
      </DocSection>
      {GROUPS.map((group) => (
        <DocSection key={group.title} title={group.title}>
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-7">
            {group.icons.map(({ name, icon: Icon }) => (
              <li
                key={name}
                className="flex flex-col items-center gap-2.5 rounded-lg border border-gray-100 px-2 py-4"
              >
                <Icon {...iconProps} className="text-gray-950" />
                <span
                  title={name}
                  className="w-full truncate text-center font-mono text-[11px] text-gray-500"
                >
                  {name}
                </span>
              </li>
            ))}
          </ul>
        </DocSection>
      ))}
    </>
  );
}
