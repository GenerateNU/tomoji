"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { RequireAccount } from "@/features/users/components/require-account";
import { useNow } from "@/hooks/use-now";
import { formatRelativeTime } from "@/lib/relative-time";
import { AllPosts } from "./all-posts";
import { PostAnalytics } from "./post-analytics";
import { PostDetailModal } from "./post-detail-modal";
import { RecentPosts } from "./recent-posts";

/** The creator's published posts: the latest ones, totals across them, and a sortable list. */
export function PostsView() {
  return (
    <RequireAccount
      role="creator"
      next="/posts"
      wrongRole="This page shows a creator's own posts."
      loading="Loading your posts…"
    >
      <CreatorPosts />
    </RequireAccount>
  );
}

function CreatorPosts() {
  const list = useQuery(api.posts.listMine);
  const [openPostId, setOpenPostId] = useState<Id<"posts"> | null>(null);
  const posts = list?.posts;

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-heading-lg text-gray-950">Posts</h1>
        {list === undefined ? (
          <Skeleton className="h-5 w-48" />
        ) : (
          list.metricsUpdatedAt !== null && <UpdatedAt at={list.metricsUpdatedAt} />
        )}
      </header>

      <div className="flex flex-col gap-12">
        <RecentPosts posts={posts} onOpen={setOpenPostId} />
        <hr className="border-gray-100" />
        <PostAnalytics posts={posts} />
        <hr className="border-gray-100" />
        <AllPosts posts={posts} onOpen={setOpenPostId} />
        {list?.isPartial && (
          <p className="text-body-xs text-gray-500">
            Showing posts from your 50 most recent assignments in each status.
          </p>
        )}
      </div>

      <PostDetailModal postId={openPostId} onClose={() => setOpenPostId(null)} />
    </div>
  );
}

/** When X counts were last read, e.g. "Updated 2 hours ago from X". */
function UpdatedAt({ at }: { at: number }) {
  const now = useNow();
  return (
    <p className="text-body text-gray-500">
      Updated <time dateTime={new Date(at).toISOString()}>{formatRelativeTime(at, now)}</time> from
      X
    </p>
  );
}
