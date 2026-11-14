"use client";

import { useState } from "react";
import { Banner } from "@/components/banner";
import { Button } from "@/components/ui/button";
import { Example } from "@/features/design-system/components/docs/example";

export function BannerExamples() {
  const [hidden, setHidden] = useState<string[]>([]);
  const dismiss = (id: string) => setHidden((value) => [...value, id]);
  const shown = (id: string) => !hidden.includes(id);

  return (
    <Example
      title="Tones"
      description="Success, neutral and error, each with an optional Button action. Click × to dismiss."
      canvasClassName="flex-col items-stretch"
      code={`<Banner onClose={dismiss}>Way to go! You’re making more than you made last month.</Banner>
<Banner tone="neutral" actionLabel="Connect" onClose={dismiss}>
  Payouts are sent every Friday. Connect Stripe to get paid.
</Banner>
<Banner tone="error" actionLabel="Reconnect" onClose={dismiss}>
  Your X account was disconnected. Reconnect to keep posting.
</Banner>`}
    >
      {shown("success") ? (
        <Banner onClose={() => dismiss("success")}>
          Way to go! You’re making more than you made last month.
        </Banner>
      ) : null}
      {shown("neutral") ? (
        <Banner tone="neutral" actionLabel="Connect" onClose={() => dismiss("neutral")}>
          Payouts are sent every Friday. Connect Stripe to get paid.
        </Banner>
      ) : null}
      {shown("error") ? (
        <Banner tone="error" actionLabel="Reconnect" onClose={() => dismiss("error")}>
          Your X account was disconnected. Reconnect to keep posting.
        </Banner>
      ) : null}
      {hidden.length > 0 ? (
        <Button
          variant="secondary-subtle"
          size="sm"
          className="self-end"
          onClick={() => setHidden([])}
        >
          Reset
        </Button>
      ) : null}
    </Example>
  );
}
