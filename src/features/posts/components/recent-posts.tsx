"use client";

import type { Id } from "@convex/_generated/dataModel";
import { RiPlayCircleLine } from "@remixicon/react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Avatar, getInitials } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { focusRing } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { useCreatorIdentity } from "../hooks/use-creator-identity";
import { formatShortDate } from "../lib/post-format";
import type { CreatorPost } from "../lib/post-list";

const RECENT_COUNT = 8;

/** The creator's latest posts as cards in a row that scrolls sideways. */
export function RecentPosts({
  posts,
  onOpen,
}: {
  posts: CreatorPost[] | undefined;
  onOpen: (postId: Id<"posts">) => void;
}) {
  return (
    <section aria-labelledby="recent-posts" className="flex flex-col gap-6">
      <h2 id="recent-posts" className="text-heading-sm text-gray-950">
        Recent Posts
      </h2>
      {posts === undefined ? (
        <ul aria-busy className="flex gap-4 overflow-hidden">
          {Array.from({ length: 4 }, (_, i) => (
            <li key={i} className="w-72 shrink-0">
              <Skeleton className="h-64 w-full rounded-lg" />
            </li>
          ))}
        </ul>
      ) : posts.length === 0 ? (
        <NoPosts />
      ) : (
        <ul className="-mx-1 flex snap-x gap-4 overflow-x-auto px-1 pt-1 pb-4">
          {posts.slice(0, RECENT_COUNT).map((post) => (
            <li key={post.postId} className="w-72 shrink-0 snap-start">
              <PostCard post={post} onOpen={() => onOpen(post.postId)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function NoPosts() {
  return (
    <div className="flex flex-col items-start gap-3">
      <div aria-hidden className="size-32 rounded-full bg-gray-50" />
      <p className="text-body font-medium text-gray-700">Nothing to see here!</p>
      <p className="max-w-md text-body-sm text-gray-500">
        Your posts show up here once a company approves your draft and you add the link to your X
        post.
      </p>
      <Link
        href="/assignments"
        className={buttonVariants({ variant: "secondary-subtle", size: "sm" })}
      >
        Go to assignments
      </Link>
    </div>
  );
}

function PostCard({ post, onOpen }: { post: CreatorPost; onOpen: () => void }) {
  const { name, handle } = useCreatorIdentity();
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${post.title}, posted ${formatShortDate(post.postedAt)}. View details`}
      className={cn(
        "flex w-full cursor-pointer flex-col gap-3 rounded-lg bg-gray-0 p-3 text-left shadow-tile transition-shadow hover:shadow-tile-hover",
        focusRing,
      )}
    >
      <span className="flex w-full items-start gap-2">
        <Avatar size={32} initials={name ? getInitials(name) : undefined} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-body-sm font-medium text-gray-950">{name}</span>
          {handle && <span className="truncate text-body-xs text-gray-500">@{handle}</span>}
        </span>
        <span className="shrink-0 text-body-xs text-gray-500">
          {formatShortDate(post.postedAt)}
        </span>
      </span>
      <span className="line-clamp-2 min-h-10 text-body-xs text-gray-950">
        {post.caption ?? post.title}
      </span>
      <span className="flex aspect-video w-full items-center justify-center rounded bg-gray-950 text-gray-0">
        <RiPlayCircleLine aria-hidden size={28} />
      </span>
    </button>
  );
}
