import { createCn } from "cn/config";

// The design-system type scale lives in globals.css as `--text-*` sizes. cn
// has to know those names are sizes, or it reads `text-body-sm` as a color and
// drops it when a `text-<color>` class comes after it.
export const cn = createCn({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "heading-xxl",
            "heading-xl",
            "heading-lg",
            "heading-md",
            "heading-sm",
            "body-lg",
            "body",
            "body-sm",
            "body-xs",
          ],
        },
      ],
    },
  },
});
