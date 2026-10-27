import type { ReactNode } from "react";

/** One titled block on the design-system page, linkable by its id. */
export function PreviewSection({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-8 space-y-6">
      <div className="space-y-2">
        <h2 id={`${id}-title`} className="text-heading-sm">
          {title}
        </h2>
        <p className="max-w-2xl text-body-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}
