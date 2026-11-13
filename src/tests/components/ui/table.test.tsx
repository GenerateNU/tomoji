import { expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TableSortButton } from "@/components/ui/table";

test("shows both chevrons in gray on a column that isn't sorted", () => {
  const html = renderToStaticMarkup(<TableSortButton>Name</TableSortButton>);

  expect(html).toContain('data-direction="none"');
  expect(html).not.toContain(' data-sorted=""');
  expect(html).not.toContain("fill-gray-950");
});

test.each([
  ["ascending", "M18.2072 9.0428"],
  ["descending", "M5.79285 14.9572"],
] as const)("darkens the %s chevron on a sorted column", (direction, chevron) => {
  const html = renderToStaticMarkup(<TableSortButton direction={direction}>Name</TableSortButton>);

  expect(html).toContain(' data-sorted=""');
  expect(html).toContain(`data-direction="${direction}"`);
  expect(html).toMatch(new RegExp(`d="${chevron}[^"]*" class="fill-gray-950"`));
  expect(html.match(/fill-gray-950/g)).toHaveLength(1);
});
