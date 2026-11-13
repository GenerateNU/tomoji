"use client";

import { useState } from "react";
import { TextAreaField } from "@/components/text-area-field";
import { Example } from "@/features/design-system/components/docs/example";

export function TextAreaExamples() {
  const [note, setNote] = useState("");
  return (
    <>
      <Example
        title="Required with helper and counter"
        description="maxLength drives the counter; helper explains what the text is for."
        code={`const [note, setNote] = useState("");

<TextAreaField
  label="Note"
  required
  placeholder="Write a message..."
  helper="To submit this application, you must attach a note for the team to review."
  maxLength={200}
  value={note}
  onChange={(e) => setNote(e.target.value)}
/>`}
      >
        <TextAreaField
          label="Note"
          required
          placeholder="Write a message..."
          helper="To submit this application, you must attach a note for the team to review."
          maxLength={200}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          className="w-full max-w-99.5"
        />
      </Example>
      <Example
        title="Filled and error"
        code={`<TextAreaField label="Description" maxLength={200} defaultValue="We need a faceless video of you doing a DITL as a UX designer using Claude." />
<TextAreaField label="Description" maxLength={200} placeholder="Write a message..." error="Add a description before you continue." />`}
      >
        <TextAreaField
          label="Description"
          maxLength={200}
          defaultValue="We need a faceless video of you doing a DITL as a UX designer using Claude."
          className="w-full max-w-99.5"
        />
        <TextAreaField
          label="Description"
          maxLength={200}
          placeholder="Write a message..."
          error="Add a description before you continue."
          className="w-full max-w-99.5"
        />
      </Example>
    </>
  );
}
