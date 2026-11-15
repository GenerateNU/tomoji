import type { Metadata } from "next";
import { OperatorCompanies } from "@/features/operator/components/operator-companies";
import { RequireAccount } from "@/features/users/components/require-account";

export const metadata: Metadata = { title: "Companies · Tomoji" };

/** Every company workspace on Ohani. */
export default function CompaniesPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-10">
      <RequireAccount
        role="operator"
        next="/companies"
        wrongRole="This page is for the Ohani team."
        loading="Loading companies…"
      >
        <OperatorCompanies />
      </RequireAccount>
    </div>
  );
}
