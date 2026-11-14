"use client";

import type { Id } from "@convex/_generated/dataModel";
import { RiAddLine } from "@remixicon/react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { iconProps } from "@/lib/icons";
import { CreateDisputeModal, type CreatedDispute } from "./create-dispute-modal";
import { DisputeDetailModal } from "./dispute-detail-modal";
import { DisputeSubmittedModal } from "./dispute-submitted-modal";
import { DisputesTable } from "./disputes-table";

/**
 * The creator's disputes: open ones under Active, resolved ones under Past.
 * Filing one shows a thank-you, then a toast that links to the new dispute.
 */
export function CreatorDisputes() {
  const [creating, setCreating] = useState(false);
  const [submitted, setSubmitted] = useState<CreatedDispute | null>(null);
  const [viewing, setViewing] = useState<Id<"disputes"> | null>(null);

  function dismissThanks() {
    if (submitted === null) return;
    const { disputeId, companyName } = submitted;
    setSubmitted(null);
    toast.success(
      <>
        Dispute for <span className="font-medium">{companyName}</span> was successfully submitted
      </>,
      { action: { label: "View", onClick: () => setViewing(disputeId) } },
    );
  }

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-heading-lg font-medium text-gray-950">Disputes</h1>
        <Button onClick={() => setCreating(true)}>
          <RiAddLine {...iconProps} />
          Create Dispute
        </Button>
      </div>

      <Tabs defaultValue="open" className="gap-8">
        <TabsList>
          <TabsTrigger value="open">Active Disputes</TabsTrigger>
          <TabsTrigger value="resolved">Past Disputes</TabsTrigger>
        </TabsList>
        <TabsContent value="open">
          <DisputesTable status="open" onOpen={setViewing} />
        </TabsContent>
        <TabsContent value="resolved">
          <DisputesTable status="resolved" onOpen={setViewing} />
        </TabsContent>
      </Tabs>

      <CreateDisputeModal
        open={creating}
        onOpenChange={setCreating}
        onCreated={(created) => {
          setCreating(false);
          setSubmitted(created);
        }}
      />
      <DisputeSubmittedModal open={submitted !== null} onDismiss={dismissThanks} />
      <DisputeDetailModal disputeId={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}
