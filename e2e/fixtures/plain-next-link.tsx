import type { ComponentProps } from "react";

/** A plain anchor in place of next/link, for fixture pages outside the app router. */
export default function Link({ href, ...props }: ComponentProps<"a"> & { href: string }) {
  return <a href={href} {...props} />;
}
