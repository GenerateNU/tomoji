import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { GoogleLogo } from "./google-logo";
import { withNext } from "../lib/access";

/**
 * A plain link rather than next/link: /auth/google sets a cookie and
 * redirects off-site, so it must never be prefetched.
 */
export function GoogleButton({ next = "/" }: { next?: string }) {
  return (
    <a
      href={withNext("/auth/google", next)}
      // cn() resolves the variant's border over the base `border-transparent`, as Button does.
      className={cn(buttonVariants({ variant: "secondary", size: "lg" }), "w-full")}
    >
      <GoogleLogo />
      Continue with Google
    </a>
  );
}
