"use client";

import { OperatorHome } from "@/features/operator/components/operator-home";
import { CompanyHome } from "@/features/company-home/components/company-home";
import { useMe } from "../hooks/use-me";
import { Welcome } from "./welcome";

/**
 * Home serves every account type, with company and operator dashboards scoped
 * by the synced identity. The key clears cached company data when accounts change.
 */
export function HomeView() {
  const me = useMe();
  if (me?.synced && me.role === "company")
    return (
      <CompanyHome
        key={`${me.userId}:${me.orgId}`}
        firstName={me.firstName}
        canCreate={me.companyRole === "admin"}
      />
    );
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-10">
      {me?.synced && me.role === "operator" ? <OperatorHome /> : <Welcome />}
    </div>
  );
}
