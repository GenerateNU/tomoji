"use client";

import { useState } from "react";
import { CountdownButton } from "@/components/countdown-button";
import { IconContainer } from "@/components/icon-container";
import { Button } from "@/components/ui/button";
import { Example } from "@/features/design-system/components/docs/example";

function RestartDemo() {
  const [run, setRun] = useState(0);
  return (
    <div className="flex items-center gap-4">
      <CountdownButton key={run} className="w-60" />
      <Button variant="secondary-ghost" size="sm" onClick={() => setRun((value) => value + 1)}>
        Restart
      </Button>
    </div>
  );
}

function SubmissionSentDemo() {
  const [run, setRun] = useState(0);
  const [closed, setClosed] = useState(false);

  if (closed) {
    return (
      <Button
        variant="secondary-subtle"
        onClick={() => {
          setClosed(false);
          setRun((value) => value + 1);
        }}
      >
        Submit again
      </Button>
    );
  }
  return (
    <div className="flex w-87.75 flex-col items-center gap-4 rounded-lg bg-gray-0 p-6 text-center shadow-card">
      <IconContainer tone="success" className="size-10" />
      <p className="text-body-lg font-medium text-gray-950">Submission sent</p>
      <p className="text-body-sm font-normal text-gray-500">
        The brand will review your video within 3 days.
      </p>
      <CountdownButton key={run} seconds={5} onComplete={() => setClosed(true)} className="w-60" />
    </div>
  );
}

export function CountdownButtonExamples() {
  return (
    <>
      <Example
        title="Countdown"
        description="The fill grows over 5 seconds; the remaining time counts down after the label. Change the key to restart."
        code="<CountdownButton key={run} seconds={5} onComplete={close} />"
      >
        <RestartDemo />
      </Example>
      <Example
        title="Submission sent"
        description="Closes itself when the countdown finishes, or when Done is clicked."
        code={`<IconContainer tone="success" />
<p>Submission sent</p>
<p>The brand will review your video within 3 days.</p>
<CountdownButton onComplete={close} className="w-60" />`}
      >
        <SubmissionSentDemo />
      </Example>
    </>
  );
}
