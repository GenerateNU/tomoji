"use client";

import { OperatorHome } from "@/features/operator/components/operator-home";
import { useMe } from "../hooks/use-me";
import { Welcome } from "./welcome";

/**
 * Home serves every account type. Operators get the platform dashboard; the
 * other roles keep the welcome panel until their own home page exists.
 */
export function HomeView() {
  const me = useMe();
  return me?.synced && me.role === "operator" ? <OperatorHome /> : <Welcome />;
}
