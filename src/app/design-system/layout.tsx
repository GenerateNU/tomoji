import type { Metadata } from "next";
import { DocsShell } from "@/features/design-system/components/shell/docs-shell";

export const metadata: Metadata = {
  title: {
    template: "%s · Design system · Tomoji",
    default: "Design system · Tomoji",
  },
};

export default function DesignSystemLayout({ children }: LayoutProps<"/design-system">) {
  return (
    <div className="min-h-dvh bg-gray-0 text-gray-950">
      <DocsShell>{children}</DocsShell>
    </div>
  );
}
