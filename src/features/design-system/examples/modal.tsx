"use client";

import { useState } from "react";
import { RiMoreLine } from "@remixicon/react";
import { Modal, ModalIconButton } from "@/components/modal";
import { Button } from "@/components/ui/button";
import { CompanyAvatar } from "@/components/ui/avatar";
import { Tag } from "@/components/ui/badge";
import { Example } from "@/features/design-system/components/docs/example";

function Demo({
  triggerLabel = "Open modal",
  ...modalProps
}: {
  triggerLabel?: string;
} & Omit<React.ComponentProps<typeof Modal>, "open" | "onOpenChange" | "footer" | "children">) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>{triggerLabel}</Button>
      <Modal
        {...modalProps}
        open={open}
        onOpenChange={setOpen}
        footer={
          <>
            <Button variant="secondary-subtle" onClick={close}>
              Secondary action
            </Button>
            <Button onClick={close}>Primary action</Button>
          </>
        }
      >
        <div className="h-[484px] rounded bg-gray-50" />
      </Modal>
    </>
  );
}

export function ModalExamples() {
  return (
    <>
      <Example
        title="Small title"
        description="18px title for quick forms and confirmations. Close with the ×, Escape, or a click on the backdrop."
        code={`<Modal
  open={open}
  onOpenChange={setOpen}
  title="Small title"
  footer={
    <>
      <Button variant="secondary-subtle" onClick={() => setOpen(false)}>Secondary action</Button>
      <Button onClick={() => setOpen(false)}>Primary action</Button>
    </>
  }
>
  …
</Modal>`}
      >
        <Demo title="Small title" />
      </Example>
      <Example
        title="Breadcrumbs"
        description="A trail above a 28px title, for content that belongs to something."
        code={`<Modal
  open={open}
  onOpenChange={setOpen}
  breadcrumbs={[
    { label: "Anthropic", avatar: <CompanyAvatar size={24} />, href: "/companies/anthropic" },
    { label: "Claude Opus 5.5" },
  ]}
  title="How-To Tutorial: Writing UX Copy and Motion"
  footer={…}
>
  …
</Modal>`}
      >
        <Demo
          title="How-To Tutorial: Writing UX Copy and Motion"
          breadcrumbs={[
            { label: "Anthropic", avatar: <CompanyAvatar size={24} />, onClick: () => {} },
            { label: "Claude Opus 5.5" },
          ]}
        />
      </Example>
      <Example
        title="Big title"
        description="28px title, with extra header controls before the close button."
        code={`<Modal
  open={open}
  onOpenChange={setOpen}
  title="Big title"
  titleSize="lg"
  actions={<ModalIconButton icon={RiMoreLine} label="More" />}
  footer={…}
>
  …
</Modal>`}
      >
        <Demo
          title="Big title"
          titleSize="lg"
          actions={<ModalIconButton icon={RiMoreLine} label="More" />}
        />
      </Example>
      <Example
        title="Eyebrow and title tags"
        description="An eyebrow row above a 28px title, level with the close button, and tags beside the title that wrap below it when the title is long. A blurred backdrop is optional."
        code={`<Modal
  open={open}
  onOpenChange={setOpen}
  title="How-To Tutorial: Writing UX Copy and Motion"
  titleSize="lg"
  eyebrow={<span>Anthropic</span>}
  titleAddon={<Tag size="md" tone="primary">Applied</Tag>}
  overlayClassName="backdrop-blur-xs"
  footer={…}
>
  …
</Modal>`}
      >
        <Demo
          title="How-To Tutorial: Writing UX Copy and Motion"
          titleSize="lg"
          eyebrow={
            <span className="flex items-center gap-2 text-body-sm text-gray-700">
              <CompanyAvatar size={24} />
              Anthropic
            </span>
          }
          titleAddon={
            <>
              <Tag size="md" tone="primary">
                Applied
              </Tag>
              <Tag size="md" tone="destructive">
                Offer expired November 11
              </Tag>
            </>
          }
          overlayClassName="backdrop-blur-xs"
        />
      </Example>
    </>
  );
}
