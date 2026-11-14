import { RiAuctionLine } from "@remixicon/react";

const COPY = {
  open: {
    title: "No active disputes",
    body: "If something goes wrong with an assignment, create a dispute and the Ohani team will follow up.",
  },
  resolved: {
    title: "No past disputes",
    body: "Disputes show up here once the Ohani team resolves them.",
  },
} as const;

/** Empty state for a tab. */
export function NoDisputes({ status }: { status: keyof typeof COPY }) {
  const { title, body } = COPY[status];
  return (
    <div className="flex flex-col items-center gap-4 py-12 text-center">
      <div
        aria-hidden
        className="flex size-32 items-center justify-center rounded-full bg-gray-50 text-gray-400"
      >
        <RiAuctionLine size={40} />
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-body font-medium text-gray-700">{title}</p>
        <p className="max-w-sm text-body-sm text-gray-500">{body}</p>
      </div>
    </div>
  );
}
