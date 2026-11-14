"use client";

import { useState } from "react";
import { RiPhoneLine, RiSearchLine } from "@remixicon/react";
import { TextField } from "@/components/text-field";
import { Example } from "@/features/design-system/components/docs/example";

export function TextFieldExamples() {
  const [email, setEmail] = useState("cole@ohani.com");
  return (
    <>
      <Example
        title="Basic"
        description="Gray label above a 4px-rounded box. Click in to see the focused blue border and ring."
        canvasClassName="flex-col items-stretch"
        code={`const [email, setEmail] = useState("cole@ohani.com");

<TextField label="Email" placeholder="you@example.com" />
<TextField label="Email" value={email} onChange={(e) => setEmail(e.target.value)} />`}
      >
        <div className="mx-auto flex w-full max-w-76.25 flex-col gap-6">
          <TextField label="Email" placeholder="you@example.com" />
          <TextField label="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
      </Example>
      <Example
        title="Error with icon"
        description="error turns the box red and shows the message below. icon adds a leading Remix icon."
        code={`import { RiPhoneLine } from "@remixicon/react";

<TextField label="Phone Number" icon={RiPhoneLine} defaultValue="(123) 456-78" error="Invalid phone number" />`}
      >
        <TextField
          label="Phone Number"
          icon={RiPhoneLine}
          defaultValue="(123) 456-78"
          error="Invalid phone number"
          className="w-76.25"
        />
      </Example>
      <Example
        title="Search and disabled"
        code={`<TextField icon={RiSearchLine} placeholder="Search creators" aria-label="Search creators" />
<TextField label="Email" placeholder="you@example.com" disabled />`}
      >
        <TextField
          icon={RiSearchLine}
          placeholder="Search creators"
          aria-label="Search creators"
          className="w-76.25"
        />
        <TextField label="Email" placeholder="you@example.com" disabled className="w-76.25" />
      </Example>
    </>
  );
}
