"use client";

import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Example } from "@/features/design-system/components/docs/example";

const SETTINGS = [
  {
    title: "Allow anyone to claim a spot",
    description: "Anyone will be able to claim a spot",
  },
  {
    title: "Get notifications in Slack",
    description: "Get a DM from ohanibot every time someone applies to your opportunity",
  },
];

export function SwitchExamples() {
  const [enabled, setEnabled] = useState([false, true]);
  return (
    <>
      <Example
        title="Settings card"
        description="Setting rows with the switch on the right, divided by a gray-100 line."
        code={`<div className="flex flex-col gap-5 rounded-lg bg-gray-25 p-5">
  <div className="flex gap-6">
    <div className="flex flex-1 flex-col gap-0.5">
      <p className="text-body font-medium text-gray-950">Allow anyone to claim a spot</p>
      <p className="text-body-sm text-gray-500">Anyone will be able to claim a spot</p>
    </div>
    <Switch aria-label="Allow anyone to claim a spot" checked={claim} onCheckedChange={setClaim} />
  </div>
  <div className="h-px bg-gray-100" />
  …
</div>`}
      >
        <div className="flex w-full max-w-117.75 flex-col gap-5 rounded-lg bg-gray-25 p-5">
          {SETTINGS.map((setting, index) => (
            <div key={setting.title} className="contents">
              {index > 0 && <div className="h-px bg-gray-100" />}
              <div className="flex gap-6">
                <div className="flex flex-1 flex-col gap-0.5">
                  <p className="text-body font-medium text-gray-950">{setting.title}</p>
                  <p className="text-body-sm font-normal text-gray-500">{setting.description}</p>
                </div>
                <Switch
                  aria-label={setting.title}
                  checked={enabled[index]}
                  onCheckedChange={(checked) =>
                    setEnabled(enabled.map((value, i) => (i === index ? checked : value)))
                  }
                />
              </div>
            </div>
          ))}
        </div>
      </Example>
      <Example
        title="States"
        code={`<Switch aria-label="Off" />
<Switch aria-label="On" defaultChecked />
<Switch aria-label="Disabled" disabled />
<Switch aria-label="Disabled on" defaultChecked disabled />`}
      >
        <Switch aria-label="Off" />
        <Switch aria-label="On" defaultChecked />
        <Switch aria-label="Disabled" disabled />
        <Switch aria-label="Disabled on" defaultChecked disabled />
      </Example>
    </>
  );
}
