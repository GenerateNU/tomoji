"use client";

import { OperatorHome } from "@/features/operator/components/operator-home";
import { useMe } from "../hooks/use-me";
import { CreatorHome } from "./creator-home";
import { Welcome } from "./welcome";

/**
 * Home serves every account type. Operators and creators get their own
 * dashboards; companies keep the welcome panel until theirs exists.
 */
export function HomeView() {
  const me = useMe();
  if (me?.synced && me.role === "operator") return <OperatorHome />;
  if (me?.synced && me.role === "creator") return <CreatorHome />;
  return <Welcome />;
}
