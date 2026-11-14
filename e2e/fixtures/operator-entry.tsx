import { createRoot } from "react-dom/client";
import { Toaster } from "@/components/ui/sonner";
import { OperatorDisputes } from "@/features/operator/components/operator-disputes";
import { OperatorUsers } from "@/features/operator/components/operator-users";
import { fixture } from "./operator-convex";

declare global {
  interface Window {
    operatorFixture: typeof fixture;
  }
}
export {};

window.operatorFixture = fixture;

const VIEWS = { users: OperatorUsers, disputes: OperatorDisputes } as const;

const view = (new URLSearchParams(location.search).get("view") ?? "users") as keyof typeof VIEWS;
const View = VIEWS[view];

createRoot(document.getElementById("root")!).render(
  <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-10">
    <View />
    <Toaster />
  </div>,
);
