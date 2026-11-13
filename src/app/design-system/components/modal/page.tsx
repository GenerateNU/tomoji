import { ComponentDocPage } from "@/features/design-system/components/docs/component-doc-page";
import { ModalExamples } from "@/features/design-system/examples/modal";
import { docMetadata } from "@/features/design-system/lib/registry";

export const metadata = docMetadata("modal");

export default function Page() {
  return (
    <ComponentDocPage
      slug="modal"
      importCode={'import { Modal, ModalIconButton } from "@/components/modal";'}
      examples={<ModalExamples />}
      usage={{
        whenToUse: [
          "Focused tasks that shouldn't leave the page: review a submission, edit details, confirm a decision.",
          "Small title for quick forms and confirmations; big title when the modal is a destination of its own.",
          "Breadcrumbs when the content belongs to something (company → opportunity).",
        ],
        do: [
          "End the footer with the primary Button; put the secondary-subtle Button before it.",
          "Keep `open` in the parent and close it from onOpenChange (close button, Escape, backdrop click).",
        ],
        dont: ["Don't stack modals. Swap the content, or move the flow to a page."],
      }}
      props={[
        {
          component: "Modal",
          rows: [
            {
              name: "open",
              type: "boolean",
              description: "Shows the modal (focus trapped, page inert).",
            },
            {
              name: "onOpenChange",
              type: "(open: boolean) => void",
              description: "Called with false by the close button, Escape, and backdrop click.",
            },
            {
              name: "title",
              type: "ReactNode",
              description: "Heading; also the dialog's accessible name.",
            },
            {
              name: "titleSize",
              type: '"sm" | "lg"',
              default: '"sm"',
              description: "18px (Small title) or 28px (Big title). Always lg with breadcrumbs.",
            },
            {
              name: "breadcrumbs",
              type: "BreadcrumbItemData[]",
              description: "Trail above the title, as in <Breadcrumbs items>.",
            },
            {
              name: "actions",
              type: "ReactNode",
              description:
                'Header controls before close, e.g. <ModalIconButton icon={RiMoreLine} label="More" />.',
            },
            {
              name: "footer",
              type: "ReactNode",
              description: "Right-aligned action row, 10px apart.",
            },
            {
              name: "children",
              type: "ReactNode",
              description: "Body. Scrolls when the modal is taller than the viewport.",
            },
            {
              name: "className",
              type: "string",
              description: "Overrides, e.g. max-w-[560px] for a narrower modal (default 818px).",
            },
          ],
        },
        {
          component: "ModalIconButton",
          rows: [
            {
              name: "icon",
              type: "IconComponent",
              description: "Remix icon, drawn at 24px in gray-500.",
            },
            { name: "label", type: "string", description: "Accessible name and tooltip." },
            { name: "onClick", type: "() => void", description: "Click handler." },
          ],
        },
      ]}
      names={[
        "modal",
        "dialog",
        "popup",
        "pop-up",
        "overlay",
        "lightbox",
        "sheet",
        "confirm dialog",
      ]}
    />
  );
}
