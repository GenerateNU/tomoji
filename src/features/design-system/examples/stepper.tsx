"use client";

import { useState } from "react";
import { Stepper } from "@/components/stepper";
import { Button } from "@/components/ui/button";
import { Example } from "@/features/design-system/components/docs/example";

const ONBOARDING = ["Connect X", "Basic info", "Content", "Portfolio"];
const OPPORTUNITY = ["Opportunity Details", "Requirements", "Compensation", "Policy", "Review"];

export function StepperExamples() {
  const [step, setStep] = useState(0);

  return (
    <>
      <Example
        title="Onboarding"
        canvasClassName="flex-col items-stretch"
        code={`<Stepper steps={["Connect X", "Basic info", "Content", "Portfolio"]} current={2} />`}
      >
        <Stepper steps={ONBOARDING} current={2} />
      </Example>
      <Example
        title="Create New Opportunity"
        description="Use Back and Next to move through the steps."
        canvasClassName="flex-col items-stretch"
        code={`<Stepper steps={["Opportunity Details", "Requirements", "Compensation", "Policy", "Review"]} current={step} />`}
      >
        <Stepper steps={OPPORTUNITY} current={step} />
        <div className="flex justify-end gap-2">
          <Button
            variant="secondary-subtle"
            size="sm"
            disabled={step === 0}
            onClick={() => setStep(step - 1)}
          >
            Back
          </Button>
          <Button
            size="sm"
            disabled={step === OPPORTUNITY.length}
            onClick={() => setStep(step + 1)}
          >
            {step >= OPPORTUNITY.length - 1 ? "Finish" : "Next"}
          </Button>
        </div>
      </Example>
      <Example
        title="All complete"
        description="Set current to steps.length."
        canvasClassName="flex-col items-stretch"
        code={`<Stepper steps={["Account", "Profile", "Done"]} current={3} className="max-w-100" />`}
      >
        <Stepper steps={["Account", "Profile", "Done"]} current={3} className="max-w-100" />
      </Example>
    </>
  );
}
