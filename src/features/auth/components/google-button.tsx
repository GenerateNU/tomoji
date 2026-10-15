import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
      className={cn(buttonVariants({ variant: "outline", size: "lg" }), "w-full")}
    >
      <GoogleLogo />
      Continue with Google
    </a>
  );
}

function GoogleLogo() {
  return (
    <svg aria-hidden viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.06H2.18A11 11 0 0 0 1 12c0 1.77.43 3.45 1.18 4.94l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.96 10.96 0 0 0 12 1 11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}
