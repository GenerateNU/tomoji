"use client";

import { Avatar, CompanyAvatar } from "@/components/ui/avatar";
import { BreadcrumbCrumb, Breadcrumbs } from "@/components/ui/breadcrumb";
import { Example } from "@/features/design-system/components/docs/example";

// Demo crumbs get `onClick` instead of `href`, so BreadcrumbCrumb renders a button
// and clicking one never changes the docs page URL. The code samples show real hrefs.
const stayOnPage = () => {};

export function BreadcrumbsExamples() {
  return (
    <>
      <Example
        title="With a company"
        description="Lead with the brand's CompanyAvatar. The last item is the current page."
        code={`<Breadcrumbs
  items={[
    {
      label: "Anthropic",
      avatar: <CompanyAvatar size={24} initials="A" />,
      href: "/companies/anthropic",
    },
    { label: "Claude Opus 5.5" },
  ]}
/>`}
      >
        <Breadcrumbs
          items={[
            {
              label: "Anthropic",
              avatar: <CompanyAvatar size={24} initials="A" />,
              onClick: stayOnPage,
            },
            { label: "Claude Opus 5.5" },
          ]}
        />
      </Example>
      <Example
        title="Deep trail"
        description="A person's avatar on the current item."
        code={`<Breadcrumbs
  items={[
    { label: "Opportunities", href: "/opportunities" },
    { label: "Claude Opus 5.5", href: "/opportunities/claude-opus-5-5" },
    { label: "Applications", href: "/opportunities/claude-opus-5-5/applications" },
    { label: "Zahra Wibisana", avatar: <Avatar size={24} initials="ZW" /> },
  ]}
/>`}
      >
        <Breadcrumbs
          items={[
            { label: "Opportunities", onClick: stayOnPage },
            { label: "Claude Opus 5.5", onClick: stayOnPage },
            { label: "Applications", onClick: stayOnPage },
            { label: "Zahra Wibisana", avatar: <Avatar size={24} initials="ZW" /> },
          ]}
        />
      </Example>
      <Example
        title="Item states"
        description="Default (gray), hover (black) and current (black medium)."
        code={`<BreadcrumbCrumb label="Anthropic" href="/companies/anthropic" />
<BreadcrumbCrumb label="Anthropic" current />`}
      >
        <BreadcrumbCrumb label="Anthropic" onClick={stayOnPage} />
        <BreadcrumbCrumb label="Anthropic" current />
      </Example>
    </>
  );
}
