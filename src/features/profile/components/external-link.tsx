import { ExternalLink as ExternalLinkIcon } from "lucide-react";

/** A saved profile link, opened in a new tab and safe to render. */
export function ExternalLink({ href, children }: { href: string; children?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex max-w-full items-center gap-2 rounded text-sm underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="min-w-0 break-all">{children ?? href}</span>
      <ExternalLinkIcon aria-hidden className="size-4 shrink-0" />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}
