import type { ReactNode } from "react";
import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { RiExpandUpDownLine } from "@remixicon/react";
import { Avatar, getInitials } from "@/components/ui/avatar";
import { iconProps } from "@/lib/icons";
import { focusRing } from "@/lib/styles";
import { cn } from "@/lib/utils";

type AvatarLabelProps = useRender.ComponentProps<"div"> & {
  /** Defaults to a 24px initials Avatar made from `name`. */
  avatar?: ReactNode;
  name: ReactNode;
  /** A second line, e.g. an email address. */
  secondary?: ReactNode;
  /** Shows an up/down chevron, for when this opens a menu. */
  chevron?: boolean;
  /** Applied to the text and chevron, e.g. to fade them with a collapsing sidebar. */
  textClassName?: string;
};

/**
 * Figma "Avatar Label": an avatar beside a name. Pass `onClick` or
 * `render={<button />}` to make it a button with a hover fill; the chevron then
 * shows on hover, focus and while its menu is open.
 */
export function AvatarLabel({
  avatar,
  name,
  secondary,
  chevron = false,
  textClassName,
  className,
  render,
  ...props
}: AvatarLabelProps) {
  const interactive = render != null || props.onClick != null;
  return useRender({
    defaultTagName: "div",
    render: render ?? (props.onClick ? <button type="button" /> : undefined),
    props: mergeProps<"div">(
      {
        className: cn(
          "group/label inline-flex items-center gap-2 rounded px-2 py-1.5 text-left",
          interactive &&
            cn(
              "transition-colors hover:bg-gray-25 aria-expanded:bg-gray-25 data-popup-open:bg-gray-25",
              focusRing,
            ),
          className,
        ),
        children: (
          <>
            <span className="flex min-w-0 flex-1 items-center gap-2">
              {avatar ??
                (typeof name === "string" ? (
                  <Avatar size={24} initials={getInitials(name)} />
                ) : null)}
              <span className={cn("flex min-w-0 flex-col", textClassName)}>
                <span className="truncate text-body-sm font-medium text-gray-950">{name}</span>
                {secondary && (
                  <span className="truncate text-body-xs font-normal text-gray-500">
                    {secondary}
                  </span>
                )}
              </span>
            </span>
            {chevron && (
              <span className={cn("flex shrink-0", textClassName)}>
                <RiExpandUpDownLine
                  {...iconProps}
                  className="text-gray-500 opacity-0 transition-opacity group-hover/label:opacity-100 group-focus-visible/label:opacity-100 group-aria-expanded/label:opacity-100 group-data-popup-open/label:opacity-100"
                />
              </span>
            )}
          </>
        ),
      },
      props,
    ),
    state: { slot: "avatar-label" },
  });
}
