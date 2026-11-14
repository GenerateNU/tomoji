import type { ReactNode } from "react";
import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { RiCheckboxCircleFill, RiCircleLine, RiErrorWarningFill } from "@remixicon/react";
import { Badge } from "@/components/ui/badge";
import { iconProps } from "@/lib/icons";
import { focusRing } from "@/lib/styles";
import { cn } from "@/lib/utils";

type AssignmentStatus = "todo" | "submitted" | "overdue";

const STATUS = {
  todo: { Icon: RiCircleLine, color: "text-gray-500", tone: "neutral", name: "To do" },
  submitted: {
    Icon: RiCheckboxCircleFill,
    color: "text-blue-primary",
    tone: "primary",
    name: "Submitted",
  },
  overdue: {
    Icon: RiErrorWarningFill,
    color: "text-red-600",
    tone: "destructive",
    name: "Overdue",
  },
} as const;

type AssignmentRowProps = Omit<useRender.ComponentProps<"button">, "title"> & {
  /** Sets the icon and the tag's tone. */
  status?: AssignmentStatus;
  title: ReactNode;
  /** The tag text, e.g. "Due in 1 day" or "2 days overdue". */
  due: ReactNode;
  /** Renders a link to this address instead of a button. */
  href?: string;
};

/**
 * Figma "Assignment Row": one assignment in a creator's to-do list. The status
 * sets the icon and the tag's tone; the title truncates to one line. Renders a
 * button, or a link when `href` is set; pass `render={<Link href="..." />}` for
 * client navigation.
 */
export function AssignmentRow({
  status = "todo",
  title,
  due,
  className,
  render,
  href,
  ...props
}: AssignmentRowProps) {
  const { Icon, color, tone, name } = STATUS[status];
  const isLink = href !== undefined;
  return useRender({
    defaultTagName: isLink ? "a" : "button",
    props: mergeProps<"button">(
      {
        ...(isLink ? { href } : render ? {} : { type: "button" as const }),
        className: cn(
          "flex w-full cursor-pointer items-center gap-4 rounded bg-gray-0 px-4 py-3 text-left transition-colors hover:bg-gray-25",
          focusRing,
          className,
        ),
        children: (
          <>
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <Icon {...iconProps} size={20} className={cn("shrink-0", color)} />
              <span className="sr-only">{name}:</span>
              <span className="truncate text-body-sm font-medium text-gray-950">{title}</span>
            </span>
            <Badge tone={tone} size="sm">
              {due}
            </Badge>
          </>
        ),
      },
      props,
    ),
    render,
    state: { slot: "assignment-row", status },
  });
}
