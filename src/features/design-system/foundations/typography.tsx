import { CodeBlock } from "@/features/design-system/components/docs/code-block";
import { DocSection } from "@/features/design-system/components/docs/section";

const WEIGHTS = [
  { label: "Regular", className: "font-normal" },
  { label: "Medium", className: "font-medium" },
  { label: "Semibold", className: "font-semibold" },
  { label: "Bold", className: "font-bold" },
];

const TEXT_STYLES = [
  { name: "heading-xxl", px: 40, className: "text-heading-xxl" },
  { name: "heading-xl", px: 36, className: "text-heading-xl" },
  { name: "heading-lg", px: 32, className: "text-heading-lg" },
  { name: "heading-md", px: 28, className: "text-heading-md" },
  { name: "heading-sm", px: 24, className: "text-heading-sm" },
  { name: "body-lg-default", px: 18, className: "text-body-lg font-normal" },
  { name: "body-lg-medium", px: 18, className: "text-body-lg font-medium" },
  { name: "body-lg-strong", px: 18, className: "text-body-lg font-semibold" },
  { name: "body-default", px: 16, className: "text-body font-normal" },
  { name: "body-medium", px: 16, className: "text-body font-medium" },
  { name: "body-strong", px: 16, className: "text-body font-semibold" },
  { name: "body-sm-default", px: 14, className: "text-body-sm font-normal" },
  { name: "body-sm-medium", px: 14, className: "text-body-sm font-medium" },
  { name: "body-sm-strong", px: 14, className: "text-body-sm font-semibold" },
  { name: "body-xs-default", px: 12, className: "text-body-xs font-normal" },
  { name: "body-xs-medium", px: 12, className: "text-body-xs font-medium" },
  { name: "body-xs-strong", px: 12, className: "text-body-xs font-semibold" },
];

const SAMPLE = "Apply to a campaign";

const CODE = `<main className="font-sans">…</main>
<h2 className="text-heading-sm">Opportunities</h2>
<p className="text-body-sm font-medium text-gray-500">Applications</p>`;

export function TypographyFoundation() {
  return (
    <>
      <DocSection
        title="Host Grotesk"
        description="Tomoji loads the font once at the root and turns on ss02 globally. Buttons use Medium at 16px."
      >
        <div className="divide-y divide-gray-100 rounded-lg border border-gray-100">
          {WEIGHTS.map((weight) => (
            <div
              key={weight.label}
              className="grid items-center gap-2 px-5 py-4 md:grid-cols-[1fr_200px]"
            >
              <p className={`truncate text-[28px] leading-[1.21] ${weight.className}`}>{SAMPLE}</p>
              <p className="text-body-xs text-gray-400 md:text-right">{weight.label}</p>
            </div>
          ))}
        </div>
      </DocSection>
      <DocSection
        title="Text styles"
        description="The Figma text styles, available as text-heading-* and text-body-* classes. All use an auto line height."
      >
        <div className="divide-y divide-gray-100 rounded-lg border border-gray-100">
          {TEXT_STYLES.map((style) => (
            <div
              key={style.name}
              className="grid items-center gap-2 px-5 py-3 md:grid-cols-[1fr_260px]"
            >
              <p className={`truncate text-gray-950 ${style.className}`}>{SAMPLE}</p>
              <p className="font-mono text-body-xs text-gray-400 md:text-right">
                {style.name} · {style.px} px
              </p>
            </div>
          ))}
        </div>
      </DocSection>
      <DocSection title="Single-storey a" description="Stylistic set 2 off and on.">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-gray-100 p-6">
            <p className="text-[56px] leading-none [font-feature-settings:normal]">aa</p>
            <p className="mt-3 text-body-xs text-gray-400">Default</p>
          </div>
          <div className="rounded-lg border border-gray-100 p-6">
            <p className="text-[56px] leading-none">aa</p>
            <p className="mt-3 text-body-xs text-gray-400">ss02 (what Tomoji uses)</p>
          </div>
        </div>
      </DocSection>
      <DocSection title="In code">
        <CodeBlock tone="import" code={CODE} />
      </DocSection>
    </>
  );
}
