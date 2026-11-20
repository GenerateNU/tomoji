import { createRoot } from "react-dom/client";
import { AppShell } from "@/features/navigation/components/app-shell";
import { AssignmentDetailView } from "@/features/assignments/components/assignment-detail-view";

const state = new URLSearchParams(location.search).get("state") ?? "pending";
createRoot(document.getElementById("root")!).render(
  <AppShell>
    <p>Assignment layout fixture preview · synthetic data · no submission/provider calls</p>
    <AssignmentDetailView
      assignmentId="assignment0"
      status={state === "pending" ? "review" : state === "approved" ? "approved" : "changesNeeded"}
    />
  </AppShell>,
);
