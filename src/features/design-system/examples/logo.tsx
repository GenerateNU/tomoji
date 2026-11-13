"use client";

import { Logo } from "@/components/logo";
import { Example } from "@/features/design-system/components/docs/example";

const SIZES = [16, 20, 24, 32, 40, 48, 64] as const;

export function LogoExamples() {
  return (
    <>
      <Example
        title="Expanded"
        description="The [ohani] wordmark. size is the height."
        canvasClassName="flex-col items-start"
        code={SIZES.map((size) => `<Logo size={${size}} />`).join("\n")}
      >
        {SIZES.map((size) => (
          <Logo key={size} size={size} />
        ))}
      </Example>
      <Example
        title="Collapsed"
        description="The [o] mark for rails and small spaces."
        code={SIZES.map((size) => `<Logo type="collapsed" size={${size}} />`).join("\n")}
      >
        {SIZES.map((size) => (
          <Logo key={size} type="collapsed" size={size} />
        ))}
      </Example>
      <Example
        title="Color"
        description="The logo uses currentColor, so a text class recolors it."
        code={`<Logo size={48} className="text-gray-0" />
<Logo size={48} className="text-mint-primary" />`}
      >
        <div className="flex items-center gap-6 rounded-lg bg-gray-950 p-6">
          <Logo size={48} className="text-gray-0" />
          <Logo size={48} className="text-mint-primary" />
        </div>
      </Example>
    </>
  );
}
