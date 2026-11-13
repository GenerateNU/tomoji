import { RiArrowRightLine } from "@remixicon/react";
import type { Metadata } from "next";
import Link from "next/link";
import { CodeBlock } from "@/features/design-system/components/docs/code-block";
import { PageHeader } from "@/features/design-system/components/docs/page-header";
import { DocSection } from "@/features/design-system/components/docs/section";
import { COMPONENTS, INTRODUCTION } from "@/features/design-system/lib/registry";
import { iconProps } from "@/lib/icons";
import { focusRing } from "@/lib/styles";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { description: INTRODUCTION.summary };

const IMPORT_CODE = `import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { iconProps } from "@/lib/icons";`;

export default function IntroductionPage() {
  return (
    <div className="max-w-5xl">
      <PageHeader
        eyebrow="Tomoji Design System"
        title={INTRODUCTION.name}
        summary={INTRODUCTION.summary}
      />
      <DocSection title="Using it in a prototype">
        <CodeBlock tone="import" code={IMPORT_CODE} />
      </DocSection>
      <DocSection id="components" title="Components">
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {COMPONENTS.map((entry) => (
            <li key={entry.slug} className="flex">
              <Link
                href={entry.href}
                className={cn(
                  "group flex w-full flex-col rounded-lg border border-gray-100 bg-gray-0 p-5 shadow-tile transition hover:border-gray-200 hover:shadow-tile-hover",
                  focusRing,
                )}
              >
                <span className="flex items-center justify-between text-body font-medium text-gray-950">
                  {entry.name}
                  <RiArrowRightLine
                    {...iconProps}
                    className="text-gray-300 transition-colors group-hover:text-blue-primary"
                  />
                </span>
                <span className="mt-1.5 text-body-sm leading-[1.5] font-normal text-gray-500">
                  {entry.summary}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </DocSection>
    </div>
  );
}
