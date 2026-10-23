import { Button } from "@/components/ui/button";
import { DialogClose, DialogDescription, DialogTitle } from "@/components/ui/dialog";

// Added this confirmation, but it wasn't in the Figma designs.
/** The last step of the application flow. */
export function ApplicationSent() {
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <DialogTitle className="text-2xl font-semibold">Application sent</DialogTitle>
      <DialogDescription>We&apos;ll notify you when the company responds.</DialogDescription>
      <DialogClose render={<Button size="lg" className="px-12" />}>Done</DialogClose>
    </div>
  );
}
