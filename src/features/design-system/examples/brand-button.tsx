"use client";

import { BrandButton } from "@/components/brand-button";
import type { Brand } from "@/components/brand-logo";
import { TextField } from "@/components/text-field";
import { Button } from "@/components/ui/button";
import { Example } from "@/features/design-system/components/docs/example";

const BRANDS: Brand[] = ["stripe", "x", "google", "apple"];
const VARIANTS = ["primary", "secondary-subtle", "secondary"] as const;

export function BrandButtonExamples() {
  return (
    <>
      <Example
        title="Brands and styles"
        description="Stripe and X put their mark after the label; Google and Apple lead with it. The Google G and Stripe wordmark turn white on dark buttons."
        canvasClassName="grid grid-cols-3 justify-items-start"
        code={`<BrandButton brand="stripe" variant="primary" />
<BrandButton brand="x" variant="secondary-subtle" />
<BrandButton brand="google" variant="secondary" />`}
      >
        {BRANDS.flatMap((brand) =>
          VARIANTS.map((variant) => (
            <BrandButton key={`${brand}-${variant}`} brand={brand} variant={variant} />
          )),
        )}
      </Example>
      <Example
        title="Sign in"
        description="A full-width secondary-subtle stack above the email form."
        code={`<BrandButton brand="google" variant="secondary-subtle" fullWidth label="Sign in with" />
<BrandButton brand="apple" variant="secondary-subtle" fullWidth label="Sign in with" />
<BrandButton brand="x" variant="secondary-subtle" fullWidth label="Sign in with" />`}
      >
        <form className="flex w-90 flex-col gap-3" onSubmit={(event) => event.preventDefault()}>
          <h2 className="text-heading-sm font-medium text-gray-950">Sign in to Tomoji</h2>
          <BrandButton brand="google" variant="secondary-subtle" fullWidth label="Sign in with" />
          <BrandButton brand="apple" variant="secondary-subtle" fullWidth label="Sign in with" />
          <BrandButton brand="x" variant="secondary-subtle" fullWidth label="Sign in with" />
          <div className="flex items-center gap-3 text-body-xs font-normal text-gray-500">
            <span className="h-px flex-1 bg-gray-200" />
            or
            <span className="h-px flex-1 bg-gray-200" />
          </div>
          <TextField label="Email" type="email" placeholder="you@example.com" />
          <TextField label="Password" type="password" placeholder="••••••••" />
          <Button type="submit" fullWidth disabled>
            Log in
          </Button>
        </form>
      </Example>
      <Example
        title="Connect and view"
        description="Connect with Stripe for payouts; View on X links out with the external icon."
        canvasClassName="flex-col"
        code={`<BrandButton brand="stripe" variant="primary" label="Connect with" />
<BrandButton brand="x" variant="secondary-subtle" label="View on" external />`}
      >
        <BrandButton brand="stripe" variant="primary" label="Connect with" />
        <BrandButton brand="x" variant="secondary-subtle" label="View on" external />
      </Example>
    </>
  );
}
