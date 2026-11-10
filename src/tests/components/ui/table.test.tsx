import { expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TableSortButton } from "@/components/ui/table";

test("shows both chevrons in gray on a column that isn't sorted", () => {
  const html = renderToStaticMarkup(<TableSortButton>Name</TableSortButton>);

  expect(html).toContain('data-direction="none"');
  expect(html).not.toContain(' data-sorted=""');
  expect(html).not.toContain('class="text-foreground"');
});

test.each([
  ["ascending", "m7 9 5-5 5 5"],
  ["descending", "m7 15 5 5 5-5"],
] as const)("darkens the %s chevron on a sorted column", (direction, chevron) => {
  const html = renderToStaticMarkup(<TableSortButton direction={direction}>Name</TableSortButton>);

  expect(html).toContain(' data-sorted=""');
  expect(html).toContain(`data-direction="${direction}"`);
  expect(html).toContain(`d="${chevron}" class="text-foreground"`);
});
