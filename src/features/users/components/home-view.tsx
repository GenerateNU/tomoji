"use client";

import type { ReactNode } from "react";
import { OperatorHome } from "@/features/operator/components/operator-home";
import { useMe } from "../hooks/use-me";
import { CreatorHome } from "./creator-home";
import { Welcome } from "./welcome";

function Centered({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-10">{children}</div>;
}

/**
 * Home serves every account type. Operators and creators get their own
 * dashboards; companies keep the welcome panel until theirs exists. The
 * creator home lays out its own page, like the Opportunities feed.
 */
export function HomeView() {
  const me = useMe();
  if (me?.synced && me.role === "creator") return <CreatorHome />;
  return (
    <Centered>{me?.synced && me.role === "operator" ? <OperatorHome /> : <Welcome />}</Centered>
  );
}
