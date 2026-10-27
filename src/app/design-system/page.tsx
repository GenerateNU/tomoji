import type { Metadata } from "next";
import {
  ColorPreview,
  RadiusPreview,
  TypographyPreview,
} from "@/features/design-system/components/foundations";
import {
  ButtonPreview,
  ChoicePreview,
  SelectPreview,
  TextFieldPreview,
} from "@/features/design-system/components/form-controls";
import {
  AvatarPreview,
  NavigationPreview,
  ProgressPreview,
  TagPreview,
} from "@/features/design-system/components/display";
import { MenuPreview, MultiSelectPreview } from "@/features/design-system/components/overlays";

export const metadata: Metadata = { title: "Design system · Tomoji" };

/** Internal reference for the Figma mid-fi tokens and components. */
export default function DesignSystemPage() {
  return (
    <main className="mx-auto w-full max-w-5xl space-y-16 px-4 py-8 sm:px-6 sm:py-12">
      <div className="space-y-2">
        <h1 className="text-heading-lg">Design system</h1>
        <p className="text-body-sm text-muted-foreground">
          Tokens and components from the Figma mid-fi library. Components live in src/components/ui.
        </p>
      </div>
      <ColorPreview />
      <TypographyPreview />
      <RadiusPreview />
      <ButtonPreview />
      <TextFieldPreview />
      <SelectPreview />
      <MultiSelectPreview />
      <ChoicePreview />
      <TagPreview />
      <AvatarPreview />
      <NavigationPreview />
      <ProgressPreview />
      <MenuPreview />
    </main>
  );
}
