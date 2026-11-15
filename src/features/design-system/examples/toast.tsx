"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Example } from "@/features/design-system/components/docs/example";

function Dismissible({ children }: { children: (dismiss: () => void) => React.ReactNode }) {
  const [shown, setShown] = useState(true);
  return shown ? children(() => setShown(false)) : null;
}

export function ToastExamples() {
  const [reset, setReset] = useState(0);
  return (
    <>
      <Example
        title="Toast"
        description="Prefix, a black medium entity, and a suffix, with an optional action and close."
        code={`<Toast prefix="Application for" entity="Opus 5.5" suffix="sent" actionLabel="View" onClose={dismiss} />`}
      >
        <Toast
          prefix="Application for"
          entity="Opus 5.5"
          suffix="sent"
          actionLabel="View"
          onClose={() => undefined}
        />
      </Example>
      <Example
        title="Tones"
        description="Click × to dismiss."
        canvasClassName="flex-col items-start"
        code={`<Toast prefix="Submission for" entity="Design Workflow Walkthrough" suffix="sent" actionLabel="View assignment" onClose={dismiss} />
<Toast tone="neutral" prefix="Moved" entity="3 applications" suffix="to archive" actionLabel="Undo" onClose={dismiss} />
<Toast tone="error" prefix="Couldn’t upload" entity="longvideonameclaude.mp4" suffix="— file too large" actionLabel="Retry" onClose={dismiss} />`}
      >
        <div key={reset} className="flex flex-col items-start gap-4">
          <Dismissible>
            {(dismiss) => (
              <Toast
                prefix="Submission for"
                entity="Design Workflow Walkthrough"
                suffix="sent"
                actionLabel="View assignment"
                onClose={dismiss}
              />
            )}
          </Dismissible>
          <Dismissible>
            {(dismiss) => (
              <Toast
                tone="neutral"
                prefix="Moved"
                entity="3 applications"
                suffix="to archive"
                actionLabel="Undo"
                onClose={dismiss}
              />
            )}
          </Dismissible>
          <Dismissible>
            {(dismiss) => (
              <Toast
                tone="error"
                prefix="Couldn’t upload"
                entity="longvideonameclaude.mp4"
                suffix="— file too large"
                actionLabel="Retry"
                onClose={dismiss}
              />
            )}
          </Dismissible>
        </div>
        <Button
          variant="secondary-subtle"
          size="sm"
          className="self-end"
          onClick={() => setReset((value) => value + 1)}
        >
          Reset
        </Button>
      </Example>
      <Example
        title="Live toast"
        description="The app's real toasts come from sonner, styled to match. This one dismisses itself."
        code={`import { toast } from "sonner";

toast.success("Application for Opus 5.5 sent");`}
      >
        <Button onClick={() => toast.success("Application for Opus 5.5 sent")}>Show toast</Button>
      </Example>
    </>
  );
}
