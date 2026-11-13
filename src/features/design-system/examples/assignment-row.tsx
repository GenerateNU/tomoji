"use client";

import { AssignmentRow } from "@/components/assignment-row";
import { Example } from "@/features/design-system/components/docs/example";

export function AssignmentRowExamples() {
  return (
    <>
      <Example
        title="Statuses"
        description="To do, submitted and overdue. Hover a row for the gray-25 tint."
        canvasClassName="flex-col items-center"
        code={`<AssignmentRow status="todo" title="Day in my life as a content creator" due="Due in 1 day" />
<AssignmentRow status="submitted" title="Day in my life as a content creator" due="Submitted" />
<AssignmentRow status="overdue" title="Day in my life as a content creator" due="2 days overdue" />`}
      >
        <AssignmentRow
          status="todo"
          title="Day in my life as a content creator"
          due="Due in 1 day"
          className="w-[412px] max-w-full"
        />
        <AssignmentRow
          status="submitted"
          title="Day in my life as a content creator"
          due="Submitted"
          className="w-[412px] max-w-full"
        />
        <AssignmentRow
          status="overdue"
          title="Day in my life as a content creator"
          due="2 days overdue"
          className="w-[412px] max-w-full"
        />
      </Example>
      <Example
        title="Upcoming assignments"
        description="White rows on a gray-25 panel, overdue first."
        code={`<div className="flex flex-col gap-2 bg-gray-25 p-5">
  <AssignmentRow status="overdue" title="Unboxing the new Opus 5.5 hardware kit" due="2 days overdue" />
  <AssignmentRow title="Day in my life as a content creator" due="Due in 1 day" />
  <AssignmentRow title="Design Workflow Walkthrough: From Brief to Final Cut" due="Due in 5 days" />
  <AssignmentRow status="submitted" title="Yeti Clear Cup review" due="Submitted" />
</div>`}
      >
        <div className="flex w-[452px] max-w-full flex-col gap-2 bg-gray-25 p-5">
          <AssignmentRow
            status="overdue"
            title="Unboxing the new Opus 5.5 hardware kit"
            due="2 days overdue"
          />
          <AssignmentRow title="Day in my life as a content creator" due="Due in 1 day" />
          <AssignmentRow
            title="Design Workflow Walkthrough: From Brief to Final Cut"
            due="Due in 5 days"
          />
          <AssignmentRow status="submitted" title="Yeti Clear Cup review" due="Submitted" />
        </div>
      </Example>
    </>
  );
}
