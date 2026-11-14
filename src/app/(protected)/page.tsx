import type { Metadata } from "next";
import { Welcome } from "@/features/users/components/welcome";

export const metadata: Metadata = { title: "Home · Tomoji" };

export default function HomePage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-12">
      <Welcome />
    </div>
  );
}
