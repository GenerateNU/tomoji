import type { ReactNode } from "react";
import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { CircleAlertIcon, CircleCheckIcon, CircleIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type AssignmentStatus = "todo" | "submitted" | "overdue";

const STATUS = {
  todo: { icon: <CircleIcon className="text-gray-500" />, tone: "neutral", name: "To do" },
  submitted: {
    icon: <CircleCheckIcon className="fill-primary text-white" />,
    tone: "primary",
    name: "Submitted",
  },
  overdue: {
    icon: <CircleAlertIcon className="fill-red-600 text-white" />,
    tone: "destructive",
    name: "Overdue",
  },
} as const;

type AssignmentRowProps = useRender.ComponentProps<"a"> & {
  status: AssignmentStatus;
  title: ReactNode;
  /** The tag text, e.g. "Due in 1 day" or "2 days overdue". */
  due: ReactNode;
};

/**
 * Figma "Assignment Row": one assignment in a creator's to-do list. The status
 * sets the icon and the tag's tone; the title truncates to one line. Renders a
 * link by default; pass `render={<Link href="..." />}` for client navigation.
 */
export function AssignmentRow({
  status,
  title,
  due,
  className,
  render,
  ...props
}: AssignmentRowProps) {
  const { icon, tone, name } = STATUS[status];
  return useRender({
    defaultTagName: "a",
    props: mergeProps<"a">(
      {
        className: cn(
          "flex items-center gap-4 rounded-sm bg-background px-4 py-3 transition-colors outline-none hover:bg-gray-25 focus-visible:ring-4 focus-visible:ring-ring/25",
          className,
        ),
        children: (
          <>
            <span className="flex min-w-0 flex-1 items-center gap-2 [&>svg]:size-5 [&>svg]:shrink-0">
              {icon}
              <span className="sr-only">{name}:</span>
              <span className="truncate text-body-sm font-medium text-foreground">{title}</span>
            </span>
            <Badge tone={tone}>{due}</Badge>
          </>
        ),
      },
      props,
    ),
    render,
    state: { slot: "assignment-row", status },
  });
}
