import type { ReactNode } from "react";
import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { ChevronsUpDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type AvatarLabelProps = useRender.ComponentProps<"div"> & {
  /** Usually a small Avatar. */
  avatar: ReactNode;
  name: ReactNode;
  /** A second line, e.g. an email address. */
  secondary?: ReactNode;
  /** Shows an up/down chevron, for when this opens a menu. */
  chevron?: boolean;
};

/** Figma "Avatar Label": an avatar beside a name. Render it as a button to open a menu. */
export function AvatarLabel({
  avatar,
  name,
  secondary,
  chevron = false,
  className,
  render,
  ...props
}: AvatarLabelProps) {
  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(
      {
        className: cn(
          "inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
          className,
        ),
        children: (
          <>
            {avatar}
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-body-sm font-medium text-foreground">{name}</span>
              {secondary && (
                <span className="truncate text-body-xs text-muted-foreground">{secondary}</span>
              )}
            </span>
            {chevron && (
              <ChevronsUpDownIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
            )}
          </>
        ),
      },
      props,
    ),
    render,
    state: { slot: "avatar-label" },
  });
}
