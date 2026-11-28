import { describe, expect, it } from "vitest";
import { engagementTotal, sortPosts } from "@/features/posts/lib/post-list";

const rows = [
  { title: "b roll", opportunityTitle: "Gemini", postedAt: 2, earnings: 500, likes: 10 },
  { title: "Aurora", opportunityTitle: "Copilot", postedAt: 3, earnings: 0 },
  { title: "cascade", opportunityTitle: "Atlas", postedAt: 1, earnings: 900, likes: 5 },
];

describe("sortPosts", () => {
  it("sorts titles alphabetically, ignoring case", () => {
    expect(
      sortPosts(rows, { key: "name", direction: "ascending" }).map((row) => row.title),
    ).toEqual(["Aurora", "b roll", "cascade"]);
  });

  it("sorts by posted date, earnings, and opportunity in either direction", () => {
    expect(
      sortPosts(rows, { key: "postedAt", direction: "descending" }).map((row) => row.postedAt),
    ).toEqual([3, 2, 1]);
    expect(
      sortPosts(rows, { key: "earnings", direction: "ascending" }).map((row) => row.earnings),
    ).toEqual([0, 500, 900]);
    expect(
      sortPosts(rows, { key: "opportunity", direction: "descending" }).map(
        (row) => row.opportunityTitle,
      ),
    ).toEqual(["Gemini", "Copilot", "Atlas"]);
  });

  it("leaves the input order alone", () => {
    sortPosts(rows, { key: "earnings", direction: "ascending" });
    expect(rows.map((row) => row.title)).toEqual(["b roll", "Aurora", "cascade"]);
  });
});

describe("engagementTotal", () => {
  it("adds a count across posts, treating unread counts as zero", () => {
    expect(engagementTotal(rows, "likes")).toBe(15);
    expect(engagementTotal(rows, "quotes")).toBe(0);
  });
});
