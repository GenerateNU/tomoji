"use client";

import { Avatar, CompanyAvatar } from "@/components/ui/avatar";
import { BreadcrumbCrumb, Breadcrumbs } from "@/components/ui/breadcrumb";
import { Example } from "@/features/design-system/components/docs/example";

export function BreadcrumbsExamples() {
  return (
    <>
      <Example
        title="With a company"
        description="Lead with the brand's CompanyAvatar. The last item is the current page."
        code={`<Breadcrumbs
  items={[
    { label: "Anthropic", avatar: <CompanyAvatar size={24} initials="A" />, href: "#" },
    { label: "Claude Opus 5.5" },
  ]}
/>`}
      >
        <Breadcrumbs
          items={[
            { label: "Anthropic", avatar: <CompanyAvatar size={24} initials="A" />, href: "#" },
            { label: "Claude Opus 5.5" },
          ]}
        />
      </Example>
      <Example
        title="Deep trail"
        description="A person's avatar on the current item."
        code={`<Breadcrumbs
  items={[
    { label: "Opportunities", href: "#" },
    { label: "Claude Opus 5.5", href: "#" },
    { label: "Applications", href: "#" },
    { label: "Zahra Wibisana", avatar: <Avatar size={24} initials="ZW" /> },
  ]}
/>`}
      >
        <Breadcrumbs
          items={[
            { label: "Opportunities", href: "#" },
            { label: "Claude Opus 5.5", href: "#" },
            { label: "Applications", href: "#" },
            { label: "Zahra Wibisana", avatar: <Avatar size={24} initials="ZW" /> },
          ]}
        />
      </Example>
      <Example
        title="Item states"
        description="Default (gray), hover (black) and current (black medium)."
        code={`<BreadcrumbCrumb label="Anthropic" href="#" />
<BreadcrumbCrumb label="Anthropic" current />`}
      >
        <BreadcrumbCrumb label="Anthropic" href="#" />
        <BreadcrumbCrumb label="Anthropic" current />
      </Example>
    </>
  );
}
