import type { Metadata } from "next";
import { HomeView } from "@/features/users/components/home-view";

export const metadata: Metadata = { title: "Home · Tomoji" };

export default function HomePage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-10">
      <HomeView />
    </div>
  );
}
