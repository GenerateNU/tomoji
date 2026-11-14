/** Figma demo values until the backend provides profile statistics and content types. */
export const PROFILE_PREVIEW = {
  joined: "November 2026",
  followers: "231,221",
  posts: "2,131",
  averageLikes: "1,422",
  contentTypes: ["tutorials-how-to"],
} as const;

export const PREVIEW_CONTENT_TYPES = [
  { value: "tutorials-how-to", label: "Tutorials & how-to" },
] as const;
