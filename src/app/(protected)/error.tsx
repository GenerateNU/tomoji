"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function ProtectedError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div
      role="alert"
      className="mx-auto flex w-full max-w-3xl flex-col items-start gap-4 px-6 py-12"
    >
      <p className="text-sm text-muted-foreground">Something went wrong loading this page.</p>
      <Button onClick={() => retry()}>Try again</Button>
    </div>
  );
}
