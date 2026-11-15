"use client";

import { useState } from "react";
import { Example } from "@/features/design-system/components/docs/example";
import {
  Pagination,
  PaginationContent,
  PaginationControl,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

export function PaginationExamples() {
  const [page, setPage] = useState(4);

  return (
    <>
      <Example
        title="Pagination"
        description="First and last page, the current page with a neighbour each side, and ellipses for the rest."
        code={`const [page, setPage] = useState(4);

<PaginationControl pageCount={12} page={page} onPageChange={setPage} />`}
      >
        <PaginationControl pageCount={12} page={page} onPageChange={setPage} />
      </Example>
      <Example
        title="First page"
        description="Prev is disabled on page 1."
        code="<PaginationControl pageCount={10} />"
      >
        <PaginationControl pageCount={10} />
      </Example>
      <Example
        title="Items"
        description="PaginationItem types, for custom layouts."
        code={`<Pagination>
  <PaginationContent>
    <PaginationItem><PaginationPrevious render={<button type="button" />} /></PaginationItem>
    <PaginationItem><PaginationLink render={<button type="button" />}>1</PaginationLink></PaginationItem>
    <PaginationItem><PaginationLink render={<button type="button" />} isActive>2</PaginationLink></PaginationItem>
    <PaginationItem><PaginationEllipsis /></PaginationItem>
    <PaginationItem><PaginationNext render={<button type="button" />} disabled /></PaginationItem>
  </PaginationContent>
</Pagination>`}
      >
        <Pagination aria-label="Pagination items">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious render={<button type="button" />} />
            </PaginationItem>
            <PaginationItem>
              <PaginationLink render={<button type="button" />}>1</PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <PaginationLink render={<button type="button" />} isActive>
                2
              </PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <PaginationEllipsis />
            </PaginationItem>
            <PaginationItem>
              <PaginationNext render={<button type="button" />} disabled />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </Example>
    </>
  );
}
