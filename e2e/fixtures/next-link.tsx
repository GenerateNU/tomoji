import type { ComponentProps } from "react";

// Stands in for next/link, which needs the Next.js router. Like a client-side
// navigation it stays on the page, recording the destination for the spec.
export default function Link({ href, onClick, ...props }: ComponentProps<"a"> & { href: string }) {
  return (
    <a
      href={href}
      onClick={(event) => {
        onClick?.(event);
        event.preventDefault();
        window.notificationsFixture.navigations.push(href);
      }}
      {...props}
    />
  );
}
