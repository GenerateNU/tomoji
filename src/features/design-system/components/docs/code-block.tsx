import { focusRing } from "@/lib/styles";
import { cn } from "@/lib/utils";

/**
 * "import" is the standalone boxed snippet under a page header; "block" is the
 * bare code area inside an Example, which supplies its own border and panel.
 */
export function CodeBlock({
  code,
  tone = "block",
  className,
}: {
  code: string;
  tone?: "import" | "block";
  className?: string;
}) {
  return (
    <pre
      tabIndex={0}
      className={cn(
        "overflow-x-auto font-mono text-code text-gray-700",
        focusRing,
        tone === "import"
          ? "rounded-lg border border-gray-100 bg-gray-25 px-5 py-3.5"
          : "px-5 py-4",
        className,
      )}
    >
      <code>{code.trim()}</code>
    </pre>
  );
}
