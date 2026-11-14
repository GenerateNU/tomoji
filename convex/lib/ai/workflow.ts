import { WorkflowManager } from "@convex-dev/workflow";
import { components } from "../../_generated/api";

export const aiReviewWorkflow = new WorkflowManager(components.workflow, {
  workpoolOptions: { maxParallelism: 5, retryActionsByDefault: false },
});
