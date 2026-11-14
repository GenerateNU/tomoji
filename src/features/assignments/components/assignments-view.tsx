"use client";

import { api } from "@convex/_generated/api";
import { usePaginatedQuery } from "convex/react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { focusRing } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RequireAccount } from "@/features/users/components/require-account";
import { assignmentStatusLabel } from "./assignment-status";

/** Lists current and past assignments for the signed-in creator. */
export function AssignmentsView() {
  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <RequireAccount
        role="creator"
        next="/assignments"
        wrongRole="Assignments are available to creators."
      >
        <h1 className="mb-6 text-2xl font-semibold sm:text-3xl">Assignments</h1>
        <Tabs defaultValue="current">
          <TabsList aria-label="Assignment phase">
            <TabsTrigger value="current">Current</TabsTrigger>
            <TabsTrigger value="past">Past</TabsTrigger>
          </TabsList>
          <TabsContent value="current">
            <AssignmentList phase="current" />
          </TabsContent>
          <TabsContent value="past">
            <AssignmentList phase="past" />
          </TabsContent>
        </Tabs>
      </RequireAccount>
    </section>
  );
}

/** Loads assignments only for the visible tab. */
function AssignmentList({ phase }: { phase: "current" | "past" }) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.assignments.listMineSummaries,
    { phase },
    { initialNumItems: 12 },
  );
  if (status === "LoadingFirstPage") {
    return <Skeleton aria-label="Loading assignments" className="h-20 w-full" />;
  }
  if (results.length === 0 && status === "Exhausted") {
    return <p className="py-8 text-sm text-muted-foreground">No {phase} assignments yet.</p>;
  }
  return (
    <>
      <div
        aria-hidden="true"
        className="hidden grid-cols-[minmax(0,2fr)_minmax(0,1fr)_8rem] gap-4 border-b px-4 py-3 text-sm text-muted-foreground sm:grid"
      >
        <span>Name</span>
        <span>Company</span>
        <span className="text-right">Status</span>
      </div>
      <ul className="divide-y">
        {results.map((assignment) => (
          <li key={assignment._id}>
            <Link
              href={`/assignments/${assignment._id}`}
              className={cn(
                "grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 rounded px-4 py-3 hover:bg-gray-25 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_8rem]",
                focusRing,
              )}
            >
              <span className="min-w-0 break-words text-sm font-medium">
                {assignment.title ?? "Assignment"}
              </span>
              <span className="col-start-1 row-start-2 min-w-0 break-words text-sm text-muted-foreground sm:col-start-2 sm:row-start-1">
                {assignment.companyName}
              </span>
              <Badge
                size="sm"
                className="col-start-2 row-span-2 row-start-1 justify-self-end sm:col-start-3 sm:row-span-1"
              >
                {assignmentStatusLabel[assignment.status]}
              </Badge>
            </Link>
          </li>
        ))}
      </ul>
      {(status === "CanLoadMore" || status === "LoadingMore") && (
        <Button
          className="mt-4"
          variant="secondary"
          disabled={status === "LoadingMore"}
          onClick={() => loadMore(12)}
        >
          {status === "LoadingMore" ? "Loading…" : "Load more"}
        </Button>
      )}
    </>
  );
}
