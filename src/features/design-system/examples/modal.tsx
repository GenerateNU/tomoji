"use client";

import { useState } from "react";
import { RiMoreLine } from "@remixicon/react";
import { Modal, ModalIconButton } from "@/components/modal";
import { Button } from "@/components/ui/button";
import { CompanyAvatar } from "@/components/ui/avatar";
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
    { label: "Anthropic", avatar: <CompanyAvatar size={24} />, href: "#" },
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
            { label: "Anthropic", avatar: <CompanyAvatar size={24} />, href: "#" },
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
    </>
  );
}
