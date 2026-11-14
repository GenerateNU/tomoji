import { ComponentDocPage } from "@/features/design-system/components/docs/component-doc-page";
import { BreadcrumbsExamples } from "@/features/design-system/examples/breadcrumbs";
import { docMetadata } from "@/features/design-system/lib/registry";

export const metadata = docMetadata("breadcrumbs");

export default function Page() {
  return (
    <ComponentDocPage
      slug="breadcrumbs"
      importCode={'import { Breadcrumbs, BreadcrumbCrumb } from "@/components/ui/breadcrumb";'}
      examples={<BreadcrumbsExamples />}
      usage={{
        whenToUse: [
          "Detail views and modals nested under a parent (company → opportunity, opportunity → applicant).",
        ],
        do: [
          "Lead with a CompanyAvatar when the parent is a brand, or an Avatar when the current page is a person.",
        ],
        dont: ["Don't use breadcrumbs as primary navigation — that's the sidebar's job."],
      }}
      props={[
        {
          component: "Breadcrumbs",
          rows: [
            {
              name: "items",
              type: "{ label; avatar?; href?; onClick? }[]",
              description: "Trail from the root; the last item is marked current.",
            },
          ],
        },
        {
          component: "BreadcrumbCrumb",
          rows: [
            { name: "label", type: "ReactNode", description: "Item text, 16px." },
            {
              name: "avatar",
              type: "ReactNode",
              description: "Leading avatar, e.g. <CompanyAvatar size={24} />.",
            },
            {
              name: "current",
              type: "boolean",
              default: "false",
              description: 'Black medium, not a link, aria-current="page".',
            },
            { name: "href", type: "string", description: "Renders a link." },
            {
              name: "onClick",
              type: "() => void",
              description: "Renders a button when there's no href.",
            },
          ],
        },
      ]}
      names={["breadcrumbs", "breadcrumb", "path", "trail", "location", "back link"]}
    />
  );
}
