import { expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PaginationLink, PaginationPrevious } from "@/components/ui/pagination";

test("marks only the current page", () => {
  expect(renderToStaticMarkup(<PaginationLink isActive>1</PaginationLink>)).toContain(
    'aria-current="page"',
  );
  expect(renderToStaticMarkup(<PaginationLink>2</PaginationLink>)).not.toContain("aria-current");
});

test("labels the arrow for screen readers", () => {
  expect(renderToStaticMarkup(<PaginationPrevious aria-disabled />)).toContain(
    'aria-label="Previous page"',
  );
});
