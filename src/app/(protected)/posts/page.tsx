import type { Metadata } from "next";
import { PostsView } from "@/features/posts/components/posts-view";

export const metadata: Metadata = { title: "Posts · Tomoji" };

export default function PostsPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-12">
      <PostsView />
    </div>
  );
}
