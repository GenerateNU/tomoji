import type { Metadata } from "next";
import { OperatorUsers } from "@/features/operator/components/operator-users";
import { RequireAccount } from "@/features/users/components/require-account";

export const metadata: Metadata = { title: "Users · Tomoji" };

/** The Ohani-wide account directory. */
export default function UsersPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-10">
      <RequireAccount
        role="operator"
        next="/users"
        wrongRole="This page is for the Ohani team."
        loading="Loading users…"
      >
        <OperatorUsers />
      </RequireAccount>
    </div>
  );
}
