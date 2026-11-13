import type { ReactNode } from "react";

export function DocSection({
  id,
  title,
  description,
  children,
}: {
  id?: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="mt-14 scroll-mt-20">
      <h2 className="text-heading-sm text-gray-950">{title}</h2>
      {description ? (
        <p className="mt-2 max-w-2xl text-body font-normal leading-[1.5] text-gray-500">
          {description}
        </p>
      ) : null}
      <div className="mt-5">{children}</div>
    </section>
  );
}
