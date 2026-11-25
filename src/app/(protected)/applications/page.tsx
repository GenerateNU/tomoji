import type { Metadata } from "next";
import { ApplicationsView } from "@/features/applications/components/applications-view";

export const metadata: Metadata = { title: "Applications · Tomoji" };

/** `?application=<id>` opens that offer on its tab, e.g. from a notification. */
export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ application?: string | string[] }>;
}) {
  const { application } = await searchParams;
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 md:px-8 md:py-10">
      <ApplicationsView
        linkedApplicationId={typeof application === "string" ? application : undefined}
      />
    </div>
  );
}
