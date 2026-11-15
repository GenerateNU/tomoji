import { ComponentDocPage } from "@/features/design-system/components/docs/component-doc-page";
import { SkeletonExamples } from "@/features/design-system/examples/skeleton";
import { docMetadata } from "@/features/design-system/lib/registry";

export const metadata = docMetadata("skeleton");

export default function Page() {
  return (
    <ComponentDocPage
      slug="skeleton"
      importCode={`import { Skeleton, SkeletonText } from "@/components/ui/skeleton";`}
      examples={<SkeletonExamples />}
      usage={{
        whenToUse: [
          "Loading states for lists, tables, cards and profiles, where the layout is known before the data arrives.",
        ],
        do: [
          "Match the shape of the real content: circles for avatars, short bars for labels, SkeletonText for paragraphs.",
          'Put aria-busy="true" on the region that is loading.',
        ],
        dont: [
          "Don't use it for actions in progress (saving, submitting) — show that on the Button.",
          "Don't skeleton chrome that's already there, like the sidebar or page title.",
        ],
      }}
      props={[
        {
          component: "Skeleton",
          rows: [
            {
              name: "circle",
              type: "boolean",
              default: "false",
              description: "Keeps only the cells inside the circle, for a pixel-art avatar.",
            },
            {
              name: "className",
              type: "string",
              description:
                'Size it, e.g. "h-5 w-32" or "size-10". It has no height of its own, and overflow is hidden so rounded-* classes clip the tiles. Heights of 9n − 2 (7, 16, 25, 34px) fill the grid exactly.',
            },
          ],
        },
        {
          component: "SkeletonText",
          rows: [
            {
              name: "lines",
              type: "number",
              default: "3",
              description: "Number of 12px lines, 8px apart. The last one is 60% wide.",
            },
          ],
        },
      ]}
      names={[
        "skeleton",
        "shimmer",
        "pixel",
        "pixel loader",
        "wave",
        "loading",
        "loading state",
        "placeholder",
        "loader",
        "content loader",
        "ghost",
      ]}
    />
  );
}
