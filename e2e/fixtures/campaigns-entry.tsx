import { Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { CampaignList } from "@/features/campaigns/components/campaign-list";
import ProtectedError from "@/app/(protected)/error";
import { fixture } from "./campaigns-convex";

declare global {
  interface Window {
    campaignsFixture: typeof fixture;
  }
}
window.campaignsFixture = fixture;
class Boundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    return this.state.error ? (
      <ProtectedError
        error={this.state.error}
        retry={() => {
          fixture.ready();
          this.setState({ error: null });
        }}
      />
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById("root")!).render(
  <Boundary>
    <CampaignList />
  </Boundary>,
);
