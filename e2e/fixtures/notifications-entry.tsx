import { Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { NotificationsInbox } from "@/features/notifications/components/notifications-inbox";
import ProtectedError from "@/app/(protected)/error";
import { fixture } from "./notifications-convex";

declare global {
  interface Window {
    notificationsFixture: typeof fixture;
  }
}
window.notificationsFixture = fixture;
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
    <NotificationsInbox />
  </Boundary>,
);
