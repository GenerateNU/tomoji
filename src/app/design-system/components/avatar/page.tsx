import { ComponentDocPage } from "@/features/design-system/components/docs/component-doc-page";
import { AvatarExamples } from "@/features/design-system/examples/avatar";
import { docMetadata } from "@/features/design-system/lib/registry";

export const metadata = docMetadata("avatar");

export default function Page() {
  return (
    <ComponentDocPage
      slug="avatar"
      importCode={[
        'import { Avatar, CompanyAvatar, getInitials } from "@/components/ui/avatar";',
        'import { AvatarLabel } from "@/components/avatar-label";',
      ].join("\n")}
      examples={<AvatarExamples />}
      usage={{
        whenToUse: [
          "Avatar for people: creators in tables, the account at the bottom of a sidebar.",
          "CompanyAvatar for brands: opportunity cards, breadcrumbs, the company sidebar header.",
          "AvatarLabel whenever a name sits next to the image; add chevron for an account switcher.",
        ],
        do: [
          "Use 24px in dense rows and navigation; 32–48px in headers and profiles.",
          "Fall back to initials when there's no photo.",
        ],
        dont: ["Don't use a circle for a company or a rounded square for a person."],
      }}
      props={[
        {
          component: "Avatar / CompanyAvatar",
          rows: [
            {
              name: "size",
              type: "24 | 32 | 40 | 48",
              default: "24",
              description: "Width and height in px.",
            },
            {
              name: "initials",
              type: "string",
              description: "One or two letters, shown when there's no src or it fails to load.",
            },
            {
              name: "src",
              type: "string",
              description:
                "Image URL. With neither src nor initials a gray placeholder icon shows.",
            },
            { name: "alt", type: "string", default: '""', description: "Alt text for the image." },
            { name: "className", type: "string", description: "Merged onto the avatar." },
          ],
        },
        {
          component: "getInitials",
          rows: [
            {
              name: "name",
              type: "string",
              description: "Returns the first letter of each of the first two words, uppercased.",
            },
          ],
        },
        {
          component: "AvatarLabel",
          rows: [
            {
              name: "name",
              type: "ReactNode",
              description: "Primary label, 14px medium.",
            },
            {
              name: "secondary",
              type: "ReactNode",
              description: "Second line, e.g. an email.",
            },
            {
              name: "avatar",
              type: "ReactNode",
              description: "Defaults to a 24px initials Avatar from name when name is a string.",
            },
            {
              name: "chevron",
              type: "boolean",
              default: "false",
              description:
                "Up/down chevron for account switchers; shows on hover, focus, or while its menu is open.",
            },
            {
              name: "onClick / render",
              type: "() => void / ReactElement",
              description:
                "Either makes it interactive, with a gray-25 hover. onClick renders a button; pass render to supply your own, e.g. a menu trigger.",
            },
            {
              name: "textClassName",
              type: "string",
              description: "Applied to the text and chevron, e.g. to fade them with a sidebar.",
            },
          ],
        },
      ]}
      names={[
        "avatar",
        "profile picture",
        "profile photo",
        "user image",
        "initials",
        "company logo",
        "company avatar",
        "brand logo",
        "user chip",
        "account menu",
        "avatar group",
      ]}
    />
  );
}
