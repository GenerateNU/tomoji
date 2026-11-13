import { RiExternalLinkLine } from "@remixicon/react";
import { iconProps } from "@/lib/icons";
import { focusRing } from "@/lib/styles";
import { cn } from "@/lib/utils";

const FIGMA_FILE =
  "https://www.figma.com/design/UflZxe9FBzNATBg6HD1IkG/-Tomoji--Style-Guide---Component-Library";

export function FigmaLink({ label, nodeId }: { label: string; nodeId: string }) {
  return (
    <a
      href={`${FIGMA_FILE}?node-id=${nodeId.replace(":", "-")}`}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "inline-flex items-center gap-1.5 rounded border border-gray-200 bg-gray-0 px-2.5 py-1.5 text-body-xs font-medium text-gray-700 transition-colors hover:border-gray-300 hover:text-gray-950",
        focusRing,
      )}
    >
      <svg width="10" height="14" viewBox="0 0 38 57" aria-hidden="true">
        <path fill="#1abcfe" d="M19 28.5a9.5 9.5 0 1 1 19 0 9.5 9.5 0 0 1-19 0z" />
        <path fill="#0acf83" d="M0 47.5A9.5 9.5 0 0 1 9.5 38H19v9.5a9.5 9.5 0 1 1-19 0z" />
        <path fill="#ff7262" d="M19 0v19h9.5a9.5 9.5 0 1 0 0-19H19z" />
        <path fill="#f24e1e" d="M0 9.5A9.5 9.5 0 0 0 9.5 19H19V0H9.5A9.5 9.5 0 0 0 0 9.5z" />
        <path fill="#a259ff" d="M0 28.5A9.5 9.5 0 0 0 9.5 38H19V19H9.5A9.5 9.5 0 0 0 0 28.5z" />
      </svg>
      {label}
      <RiExternalLinkLine {...iconProps} size={12} className="text-gray-400" />
      <span className="sr-only">(opens in Figma)</span>
    </a>
  );
}
