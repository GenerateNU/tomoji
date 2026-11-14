import { Button } from "@/components/ui/button";

export function XAccountSection() {
  return (
    <section aria-label="X account" className="min-w-0 space-y-4 rounded-xl bg-muted/60 p-5">
      <h3 className="font-semibold">Connect your X account</h3>
      <p className="text-sm text-muted-foreground">X account connection is coming soon.</p>
      <Button type="button" className="min-h-11" disabled>
        Connect X
      </Button>
    </section>
  );
}
