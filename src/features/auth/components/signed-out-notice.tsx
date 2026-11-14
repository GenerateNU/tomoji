import { TextLink } from "./text-link";

/** Shown in place of a page's content when nobody is signed in. */
export function SignedOutNotice({ next }: { next: string }) {
  return (
    <p className="p-10 text-sm text-muted-foreground">
      Please <TextLink href={`/login?next=${encodeURIComponent(next)}`}>sign in</TextLink> to view
      this page.
    </p>
  );
}
