"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { RiExternalLinkLine, RiTimeLine } from "@remixicon/react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { ErrorBoundary } from "@/components/error-boundary";
import { Modal } from "@/components/modal";
import { StatTile } from "@/components/stat-tile";
import { Avatar, CompanyAvatar, getInitials } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SubmittedVideo } from "@/features/assignments/components/submitted-video";
import { useCompanyLogo } from "@/hooks/use-company-logo";
import { errorCode } from "@/lib/errors";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { useCreatorIdentity } from "../hooks/use-creator-identity";
import { formatLongDate } from "../lib/post-format";
import {
  ENGAGEMENT_LABELS,
  formatCompactCount,
  formatCount,
  type EngagementMetric,
} from "../lib/post-list";
import { RunningTotalChart } from "./running-total-chart";

type PostDetail = FunctionReturnType<typeof api.posts.getMine>;

/** One post's totals, preview, earnings and performance, over the Posts page. */
export function PostDetailModal({
  postId,
  onClose,
}: {
  postId: Id<"posts"> | null;
  onClose: () => void;
}) {
  // Keeps the last post on screen while the dialog animates closed.
  const [shown, setShown] = useState(postId);
  if (postId !== null && postId !== shown) setShown(postId);

  return (
    <ErrorBoundary
      key={shown ?? undefined}
      fallback={(error) => <LoadFailed error={error} onClose={onClose} />}
    >
      {shown !== null && <PostDetail postId={shown} open={postId !== null} onClose={onClose} />}
    </ErrorBoundary>
  );
}

function PostDetail({
  postId,
  open,
  onClose,
}: {
  postId: Id<"posts">;
  open: boolean;
  onClose: () => void;
}) {
  const post = useQuery(api.posts.getMine, { postId });
  const logo = useCompanyLogo(post?.companyLogoMediaId);

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      titleSize="lg"
      title={post?.title ?? <Skeleton className="h-8 w-80" />}
      breadcrumbs={
        post
          ? [
              ...(post.companyName
                ? [
                    {
                      label: post.companyName,
                      avatar: (
                        <CompanyAvatar
                          size={24}
                          src={logo.url}
                          initials={getInitials(post.companyName)}
                        />
                      ),
                    },
                  ]
                : []),
              { label: post.opportunityTitle },
            ]
          : [{ label: <Skeleton className="h-5 w-40" /> }]
      }
      className="sm:max-w-4xl"
    >
      {post === undefined ? <DetailSkeleton /> : <DetailBody post={post} />}
    </Modal>
  );
}

function DetailBody({ post }: { post: PostDetail }) {
  // Fixed when the post opens so chart days stay put between renders.
  const [now] = useState(() => new Date());
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <Badge size="md" icon={RiTimeLine}>
          Posted {formatLongDate(post.postedAt)}
        </Badge>
        <Link
          href={`/assignments/${post.assignmentId}`}
          className={buttonVariants({ variant: "secondary-subtle", size: "sm" })}
        >
          <RiExternalLinkLine aria-hidden />
          View Assignment Details
        </Link>
      </div>
      <hr className="border-gray-100" />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Total Earnings" value={formatMoney(post.earnings)} />
        <StatTile label="Total Views" value={countOrDash(post.views)} />
        <StatTile label="Total Likes" value={countOrDash(post.likes)} />
        <StatTile label="Total Comments" value={countOrDash(post.comments)} />
      </div>

      <PostPreview post={post} />

      <Card title="Earnings">
        <div className="flex flex-col gap-1">
          <p className="text-heading-md text-gray-950">{formatMoney(post.earnings)}</p>
          <p className="text-body font-medium text-gray-950">Total Earnings</p>
          <p className="text-body-xs text-gray-500">{formatTerms(post)}</p>
        </div>
        {post.earningsHistory.length === 0 ? (
          <p className="text-body-sm text-gray-500">
            No payouts yet. Earnings appear here as each one is finalized.
          </p>
        ) : (
          <RunningTotalChart
            events={post.earningsHistory}
            from={null}
            now={now}
            label="Earnings"
            format={formatMoney}
          />
        )}
      </Card>

      <Performance post={post} now={now} />
    </div>
  );
}

function PostPreview({ post }: { post: PostDetail }) {
  const { name, handle } = useCreatorIdentity();
  return (
    <section
      aria-label="Post preview"
      className="grid gap-5 rounded-lg bg-gray-0 p-4 shadow-tile sm:grid-cols-2 sm:p-5"
    >
      <div className="min-w-0">
        {post.mediaId ? (
          <SubmittedVideo mediaId={post.mediaId} eager />
        ) : (
          <p className="text-body-sm text-gray-500">No video on this draft.</p>
        )}
      </div>
      <div className="flex min-w-0 flex-col items-start gap-3">
        <div className="flex items-center gap-2">
          <Avatar size={40} initials={name ? getInitials(name) : undefined} />
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-body-sm font-medium text-gray-950">{name}</span>
            {handle && <span className="truncate text-body-sm text-gray-500">@{handle}</span>}
          </div>
        </div>
        {post.caption && (
          <p className="text-body-sm whitespace-pre-line text-gray-950">{post.caption}</p>
        )}
        <a
          href={post.url}
          target="_blank"
          rel="noreferrer"
          className={cn(buttonVariants({ variant: "secondary-subtle", size: "sm" }), "mt-auto")}
        >
          <RiExternalLinkLine aria-hidden />
          View Post on X<span className="sr-only"> (opens in a new tab)</span>
        </a>
      </div>
    </section>
  );
}

const PERFORMANCE_TABS: { value: EngagementMetric | "views"; label: string }[] = [
  { value: "likes", label: "Likes" },
  { value: "views", label: "Views" },
  { value: "comments", label: "Comments" },
  { value: "reposts", label: "Reposts" },
  { value: "quotes", label: "Quotes" },
];

/** Views chart from X's recorded counts; the other counts are current totals only. */
function Performance({ post, now }: { post: PostDetail; now: Date }) {
  const [metric, setMetric] = useState<EngagementMetric | "views">("likes");
  return (
    <Card title="Performance">
      <Tabs value={metric} onValueChange={(next) => setMetric(next as typeof metric)}>
        <TabsList aria-label="Metric" className="overflow-x-auto">
          {PERFORMANCE_TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {PERFORMANCE_TABS.map((tab) => (
          <TabsContent key={tab.value} value={tab.value} className="flex flex-col gap-6 pt-2">
            <div className="flex flex-col gap-1">
              <p className="text-heading-md text-gray-950">{countOrDash(post[tab.value])}</p>
              <p className="text-body font-medium text-gray-950">
                Total {tab.value === "views" ? "Views" : ENGAGEMENT_LABELS[tab.value]}
              </p>
              {post[tab.value] === undefined && (
                <p className="text-body-xs text-gray-500">Not read from X yet.</p>
              )}
            </div>
            {tab.value === "views" && <PostViews postId={post.postId} now={now} />}
          </TabsContent>
        ))}
      </Tabs>
    </Card>
  );
}

function PostViews({ postId, now }: { postId: Id<"posts">; now: Date }) {
  const history = useQuery(api.posts.viewHistory, { from: null, postId });
  if (history === undefined) return <Skeleton className="h-52 w-full" />;
  if (history.views.length === 0) return null;
  return (
    <RunningTotalChart
      events={history.views}
      from={null}
      now={now}
      label="Views"
      format={formatCount}
      formatAxis={formatCompactCount}
    />
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-5 rounded-lg bg-gray-0 p-4 shadow-tile sm:p-5">
      <h3 className="text-body-lg font-medium text-gray-950">{title}</h3>
      {children}
    </section>
  );
}

function DetailSkeleton() {
  return (
    <div aria-busy className="flex flex-col gap-6">
      <span className="sr-only" role="status">
        Loading post…
      </span>
      <Skeleton className="h-8 w-72" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-52 w-full" />
    </div>
  );
}

function LoadFailed({ error, onClose }: { error: unknown; onClose: () => void }) {
  return (
    <Modal
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title="Post unavailable"
      footer={<Button onClick={onClose}>Close</Button>}
    >
      <p role="alert" className="text-body-sm text-gray-700">
        {errorCode(error) === "not_found"
          ? "This post was replaced or is no longer yours to view."
          : "We couldn't load this post. Close this and try again."}
      </p>
    </Modal>
  );
}

function countOrDash(value: number | undefined): string {
  return value === undefined ? "—" : formatCount(value);
}

/** "$500 • $4.00 CPM • $5,000 Payment Cap", leaving out terms the assignment doesn't have. */
function formatTerms(post: Pick<PostDetail, "fixedFeeCents" | "cpmRateCents" | "paymentCapCents">) {
  const parts: string[] = [];
  if (post.fixedFeeCents > 0) parts.push(formatMoney(post.fixedFeeCents));
  if (post.cpmRateCents > 0) {
    parts.push(`${formatMoney(post.cpmRateCents)} CPM`);
    if (post.paymentCapCents > 0) parts.push(`${formatMoney(post.paymentCapCents)} Payment Cap`);
  }
  return parts.length === 0 ? "Unpaid" : parts.join(" • ");
}
