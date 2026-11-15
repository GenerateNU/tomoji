"use client";

import {
  RiAlertFill,
  RiCheckboxCircleFill,
  RiCloseCircleLine,
  RiNotification3Line,
  RiTimeLine,
  RiUpload2Line,
} from "@remixicon/react";
import { Example } from "@/features/design-system/components/docs/example";
import { IconContainer } from "@/components/icon-container";

export function IconContainerExamples() {
  return (
    <>
      <Example
        title="Tones"
        description="Each tone has a default icon."
        code={`<IconContainer tone="success" />
<IconContainer tone="neutral" />
<IconContainer tone="error" />`}
      >
        <IconContainer tone="success" />
        <IconContainer tone="neutral" />
        <IconContainer tone="error" />
      </Example>
      <Example
        title="Custom icons"
        description="Swap the icon to fit the message; keep the tone."
        code={`<IconContainer tone="success" icon={RiCheckboxCircleFill} />
<IconContainer tone="success" icon={RiUpload2Line} />
<IconContainer tone="neutral" icon={RiTimeLine} />
<IconContainer tone="neutral" icon={RiNotification3Line} />
<IconContainer tone="error" icon={RiCloseCircleLine} />
<IconContainer tone="error" icon={RiAlertFill} />`}
      >
        <IconContainer tone="success" icon={RiCheckboxCircleFill} />
        <IconContainer tone="success" icon={RiUpload2Line} />
        <IconContainer tone="neutral" icon={RiTimeLine} />
        <IconContainer tone="neutral" icon={RiNotification3Line} />
        <IconContainer tone="error" icon={RiCloseCircleLine} />
        <IconContainer tone="error" icon={RiAlertFill} />
      </Example>
    </>
  );
}
