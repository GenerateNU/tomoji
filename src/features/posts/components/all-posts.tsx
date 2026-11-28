"use client";

import type { Id } from "@convex/_generated/dataModel";
import { RiMoreLine } from "@remixicon/react";
import Link from "next/link";
import { useState } from "react";
import { CompanyAvatar, getInitials } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCompanyLogo } from "@/hooks/use-company-logo";
import { formatMoney } from "@/lib/money";
import { focusRing } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { formatLongDate } from "../lib/post-format";
import { sortPosts, type CreatorPost, type PostSort, type PostSortKey } from "../lib/post-list";

/** Every post in a table the creator can sort, each opening its details. */
export function AllPosts({
  posts,
  onOpen,
}: {
  posts: CreatorPost[] | undefined;
  onOpen: (postId: Id<"posts">) => void;
}) {
  const [sort, setSort] = useState<PostSort>({ key: "postedAt", direction: "descending" });
  const rows = posts && sortPosts(posts, sort);
  const sortBy = (key: PostSortKey) =>
    setSort((current) => ({
      key,
      direction:
        current.key === key && current.direction === "descending" ? "ascending" : "descending",
    }));
  const sortOf = (key: PostSortKey) => (sort.key === key ? sort.direction : "unsorted");

  return (
    <section aria-labelledby="all-posts" className="flex flex-col gap-4">
      <h2 id="all-posts" className="text-heading-sm text-gray-950">
        All posts
      </h2>
      {rows?.length === 0 ? (
        <p className="py-6 text-center text-body-sm text-gray-500">No posts yet.</p>
      ) : (
        <Table bare aria-labelledby="all-posts" className="min-w-3xl">
          <TableHeader>
            <TableHead className="w-[36%]" sort={sortOf("name")} onSort={() => sortBy("name")}>
              Name
            </TableHead>
            <TableHead sort={sortOf("opportunity")} onSort={() => sortBy("opportunity")}>
              Opportunity
            </TableHead>
            <TableHead sort={sortOf("postedAt")} onSort={() => sortBy("postedAt")}>
              Date Posted
            </TableHead>
            <TableHead sort={sortOf("earnings")} onSort={() => sortBy("earnings")}>
              Earnings
            </TableHead>
            <TableHead className="w-10">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableHeader>
          <TableBody aria-busy={rows === undefined}>
            {rows === undefined
              ? Array.from({ length: 4 }, (_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 4 }, (_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-32" />
                      </TableCell>
                    ))}
                    <TableCell />
                  </TableRow>
                ))
              : rows.map((post) => (
                  <PostRow key={post.postId} post={post} onOpen={() => onOpen(post.postId)} />
                ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}

function PostRow({ post, onOpen }: { post: CreatorPost; onOpen: () => void }) {
  const logo = useCompanyLogo(post.companyLogoMediaId);
  return (
    <TableRow>
      <TableCell type="custom">
        <CompanyAvatar
          size={32}
          src={logo.url}
          initials={post.companyName ? getInitials(post.companyName) : undefined}
        />
        <div className="flex min-w-0 flex-col">
          <button
            type="button"
            onClick={onOpen}
            className={cn(
              "cursor-pointer truncate rounded-xs text-left font-medium text-gray-950 hover:underline",
              focusRing,
            )}
          >
            {post.title}
          </button>
          {post.companyName && (
            <span className="truncate text-body-xs text-gray-500">{post.companyName}</span>
          )}
        </div>
      </TableCell>
      <TableCell>{post.opportunityTitle}</TableCell>
      <TableCell>{formatLongDate(post.postedAt)}</TableCell>
      <TableCell>{formatMoney(post.earnings)}</TableCell>
      <TableCell type="custom">
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={`Actions for ${post.title}`}
            className={cn("cursor-pointer rounded-xs text-gray-500 hover:text-gray-950", focusRing)}
          >
            <RiMoreLine aria-hidden size={16} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onOpen}>View details</DropdownMenuItem>
            <DropdownMenuItem render={<a href={post.url} target="_blank" rel="noreferrer" />}>
              View post on X
            </DropdownMenuItem>
            <DropdownMenuItem render={<Link href={`/assignments/${post.assignmentId}`} />}>
              View assignment
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}
