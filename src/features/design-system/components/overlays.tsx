"use client";

import { CopyIcon, EllipsisIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from "@/components/ui/combobox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { PreviewSection } from "./preview-section";

const NICHES = [
  "Frontend Development",
  "Backend Development",
  "Full-Stack Development",
  "Mobile App Development",
  "DevOps & Infrastructure",
  "AI / ML",
];

export function MenuPreview() {
  return (
    <PreviewSection
      id="menu"
      title="Menu & toast"
      description="Menus float above the page for overflow actions. Toasts confirm an action, name the affected item in bold, and can offer a follow-up."
    >
      <div className="flex flex-wrap items-center gap-6">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="secondary" size="icon" aria-label="Post actions" />}
          >
            <EllipsisIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuGroup>
              <DropdownMenuLabel>Post</DropdownMenuLabel>
              <DropdownMenuItem>
                <CopyIcon />
                Copy
              </DropdownMenuItem>
              <DropdownMenuItem>
                <PencilIcon />
                Edit
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive">
              <Trash2Icon />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="secondary"
          onClick={() =>
            toast.success(
              <span>
                Application for <span className="font-medium">Claude Opus 5.5</span> sent
              </span>,
              { action: { label: "View application", onClick: () => {} } },
            )
          }
        >
          Show a toast
        </Button>
        <Button
          variant="secondary"
          onClick={() =>
            toast.success(
              <span>
                Submission for{" "}
                <span className="font-medium">
                  Design Workflow Walkthrough: From Brief to Final Cut in One Afternoon
                </span>{" "}
                sent
              </span>,
              { action: { label: "View assignment", onClick: () => {} } },
            )
          }
        >
          Show a long toast
        </Button>
      </div>
    </PreviewSection>
  );
}

export function MultiSelectPreview() {
  const anchor = useComboboxAnchor();

  return (
    <PreviewSection
      id="multi-select"
      title="Multi-select"
      description="Pick several options from a searchable list. Choices show as tags that can be removed."
    >
      <Field className="max-w-sm">
        <FieldLabel htmlFor="ds-niches">Niches</FieldLabel>
        <Combobox
          multiple
          items={NICHES}
          defaultValue={["Backend Development", "AI / ML", "DevOps & Infrastructure"]}
        >
          <ComboboxChips ref={anchor}>
            <ComboboxValue>
              {(values: string[]) =>
                values.map((value) => <ComboboxChip key={value}>{value}</ComboboxChip>)
              }
            </ComboboxValue>
            <ComboboxChipsInput id="ds-niches" placeholder="Search niches" />
          </ComboboxChips>
          <ComboboxContent anchor={anchor}>
            <ComboboxEmpty>No niches found</ComboboxEmpty>
            <ComboboxList>
              {(niche: string) => (
                <ComboboxItem key={niche} value={niche} indicator="checkbox">
                  {niche}
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
        <FieldDescription>Pick up to 5</FieldDescription>
      </Field>
    </PreviewSection>
  );
}
