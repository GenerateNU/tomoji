"use client";

import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Example } from "@/features/design-system/components/docs/example";

const rowClass = "flex cursor-pointer items-center gap-2 text-body font-normal text-gray-950";

export function CheckboxExamples() {
  const [channels, setChannels] = useState({ email: true, sms: false });
  const all = channels.email && channels.sms;
  const some = channels.email || channels.sms;

  return (
    <>
      <Example
        title="Checkbox list"
        description="An indeterminate parent over indented children. Click the parent to check them all."
        canvasClassName="items-start justify-start"
        code={`const [channels, setChannels] = useState({ email: true, sms: false });
const all = channels.email && channels.sms;
const some = channels.email || channels.sms;

<label className="flex items-center gap-2">
  <Checkbox
    checked={all}
    indeterminate={some && !all}
    onCheckedChange={(v) => setChannels({ email: v, sms: v })}
  />
  All notifications
</label>
<div className="flex flex-col gap-3 pl-6">
  <label className="flex items-center gap-2">
    <Checkbox checked={channels.email} onCheckedChange={(v) => setChannels({ ...channels, email: v })} />
    Email
  </label>
  <label className="flex items-center gap-2">
    <Checkbox checked={channels.sms} onCheckedChange={(v) => setChannels({ ...channels, sms: v })} />
    SMS
  </label>
  <label className="flex items-center gap-2">
    <Checkbox disabled />
    Push (unavailable)
  </label>
</div>`}
      >
        <div className="flex flex-col gap-3">
          <label className={rowClass}>
            <Checkbox
              checked={all}
              indeterminate={some && !all}
              onCheckedChange={(value) => setChannels({ email: value, sms: value })}
            />
            All notifications
          </label>
          <div className="flex flex-col gap-3 pl-6">
            <label className={rowClass}>
              <Checkbox
                checked={channels.email}
                onCheckedChange={(value) => setChannels({ ...channels, email: value })}
              />
              Email
            </label>
            <label className={rowClass}>
              <Checkbox
                checked={channels.sms}
                onCheckedChange={(value) => setChannels({ ...channels, sms: value })}
              />
              SMS
            </label>
            <label className="flex cursor-not-allowed items-center gap-2 text-body font-normal text-gray-950">
              <Checkbox disabled />
              Push (unavailable)
            </label>
          </div>
        </div>
      </Example>
      <Example
        title="States"
        description="Unchecked, checked and indeterminate, each enabled and disabled. Hover and tab to see the hover and focus looks."
        canvasClassName="gap-6"
        code={`<Checkbox aria-label="Unchecked" />
<Checkbox aria-label="Checked" defaultChecked />
<Checkbox aria-label="Indeterminate" indeterminate />
<Checkbox aria-label="Disabled" disabled />
<Checkbox aria-label="Disabled checked" disabled defaultChecked />
<Checkbox aria-label="Disabled indeterminate" disabled indeterminate />`}
      >
        <Checkbox aria-label="Unchecked" />
        <Checkbox aria-label="Checked" defaultChecked />
        <Checkbox aria-label="Indeterminate" indeterminate />
        <Checkbox aria-label="Disabled" disabled />
        <Checkbox aria-label="Disabled checked" disabled defaultChecked />
        <Checkbox aria-label="Disabled indeterminate" disabled indeterminate />
      </Example>
    </>
  );
}
