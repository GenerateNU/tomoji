/** Centered globe illustration with a title and optional description, for an applications tab with nothing to show. */
export function ApplicationsEmptyState({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col items-center px-4 py-16 text-center sm:py-24">
      {/* eslint-disable-next-line @next/next/no-img-element -- decorative static illustration */}
      <img
        src="/illustrations/globe.png"
        alt=""
        width={380}
        height={380}
        className="mb-6 size-36 sm:size-44"
      />
      <p className="font-medium text-gray-700">{title}</p>
      {description && <p className="mt-2 text-sm text-muted-foreground">{description}</p>}
    </div>
  );
}
