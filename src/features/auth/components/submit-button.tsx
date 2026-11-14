import { LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

/** Full-width submit that disables itself while the form is busy. */
export function SubmitButton({ busy, children }: { busy: boolean; children: ReactNode }) {
  return (
    <Button type="submit" size="lg" className="w-full" disabled={busy} aria-busy={busy}>
      {busy && <LoaderCircle aria-hidden className="animate-spin" />}
      {children}
    </Button>
  );
}
