import { createRoot } from "react-dom/client";
import { CompanyInvites } from "@/features/invites/components/company-invites";
import { fixture } from "./invites-convex";

declare global {
  interface Window {
    invitesFixture: typeof fixture;
  }
}
window.invitesFixture = fixture;
createRoot(document.getElementById("root")!).render(<CompanyInvites />);
