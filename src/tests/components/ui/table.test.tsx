import { expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TableSortButton } from "@/components/ui/table";

test("shows the up/down icon on a column that isn't sorted", () => {
  const html = renderToStaticMarkup(<TableSortButton>Name</TableSortButton>);

  expect(html).toContain("lucide-chevrons-up-down");
  expect(html).not.toContain(' data-sorted=""');
});

test.each([
  ["ascending", "lucide-chevron-up"],
  ["descending", "lucide-chevron-down"],
] as const)("marks a column sorted %s with its chevron", (direction, icon) => {
  const html = renderToStaticMarkup(<TableSortButton direction={direction}>Name</TableSortButton>);

  expect(html).toContain(' data-sorted=""');
  expect(html).toContain(icon);
  expect(html).not.toContain("lucide-chevrons-up-down");
});
