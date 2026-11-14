import { useState, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import Link from "next/link";
import { ConvexProviderWithAuth } from "convex/react";
import { getFunctionName, type FunctionReference } from "convex/server";
import { ProfileNavLink } from "@/features/profile/components/profile-nav-link";

const subscribers = new Set<() => void>();
const querySubscribers = new Set<() => void>();
let revision = 0;
let result: unknown = { synced: true, role: "creator" };
const auth = new URLSearchParams(window.location.search).get("auth");
const session = { isLoading: auth === "loading", isAuthenticated: auth !== "signed-out" };
const errors: string[] = [];
const queries: string[] = [];
const fetchAccessToken = async () => "fixture-token";

const client = {
  setAuth(_fetchToken: unknown, onChange: (authenticated: boolean) => void) {
    onChange(true);
  },
  clearAuth() {},
  watchQuery(query: FunctionReference<"query">) {
    const name = getFunctionName(query);
    if (name !== "users:me") throw new Error(`Unexpected query: ${name}`);
    if (!queries.includes(name)) queries.push(name);
    return {
      localQueryResult() {
        if (result instanceof Error) throw result;
        return result;
      },
      onUpdate(callback: () => void) {
        querySubscribers.add(callback);
        return () => querySubscribers.delete(callback);
      },
      journal: () => undefined,
    };
  },
};

function useFixtureAuth() {
  useSyncExternalStore(
    (callback) => {
      subscribers.add(callback);
      return () => subscribers.delete(callback);
    },
    () => revision,
  );
  return { ...session, fetchAccessToken };
}

const fixture = {
  errors,
  queries,
  setSession(update: Partial<typeof session>) {
    Object.assign(session, update);
    revision += 1;
    subscribers.forEach((callback) => callback());
  },
  setResult(value: unknown) {
    result = value;
    querySubscribers.forEach((callback) => callback());
  },
  failQuery() {
    this.setResult(new Error("Account query unavailable"));
  },
};

declare global {
  interface Window {
    navigationFixture: typeof fixture;
  }
}
window.navigationFixture = fixture;

function Navigation() {
  const [renders, setRenders] = useState(0);
  return (
    <>
      <nav aria-label="Main navigation">
        <Link href="/">Home</Link>
        <ProfileNavLink />
        <Link href="/settings">Settings</Link>
      </nav>
      <button onClick={() => setRenders((value) => value + 1)}>Refresh shell {renders}</button>
    </>
  );
}

createRoot(document.getElementById("root")!, {
  onUncaughtError(error) {
    errors.push(error instanceof Error ? error.message : String(error));
  },
}).render(
  <ConvexProviderWithAuth client={client} useAuth={useFixtureAuth}>
    <Navigation />
  </ConvexProviderWithAuth>,
);
