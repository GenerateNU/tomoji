"use client";

import { api } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import { useAction, useMutation } from "convex/react";
import { useId, useRef, useState, type FormEvent } from "react";
import { ConvexError } from "convex/values";
import { RiCheckLine, RiCloseLine, RiTimeLine } from "@remixicon/react";
import { IconContainer } from "@/components/icon-container";
import { ProgressRing } from "@/components/progress-ring";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { errorCode, errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { SubmissionPreview } from "./submission-preview";
import { SubmittedVideo } from "./submitted-video";
import { VideoSkeleton } from "./video-preview";

type PublishedPostProps = {
  submissionId: Id<"submissions">;
  caption: string | undefined;
  startOpen: boolean;
  post: Doc<"posts"> | undefined;
  active: boolean;
  mediaId?: Id<"mediaUploads">;
};

/** Saves the published link and exposes the caption check separately from video verification. */
export function PublishedPost({
  submissionId,
  caption,
  post,
  active,
  mediaId,
  startOpen,
}: PublishedPostProps) {
  const create = useMutation(api.posts.create);
  const replace = useMutation(api.posts.replace);
  const check = useAction(api.posts.checkMyCaption);
  const inputId = useId();
  const [open, setOpen] = useState(startOpen);
  const [editing, setEditing] = useState(false);
  const [url, setUrl] = useState("");
  const [invalidUrl, setInvalidUrl] = useState(false);
  const [showRevisionNote, setShowRevisionNote] = useState(false);
  const [error, setError] = useState<string>();
  const [comparison, setComparison] = useState<{ postId: Id<"posts">; caption: string }>();
  const [checkingPost, setCheckingPost] = useState<Id<"posts">>();
  const [phase, setPhase] = useState<"saving" | "checking">();
  const submitting = useRef(false);

  async function checkPost(postId: Id<"posts">) {
    setCheckingPost(postId);
    setPhase("checking");
    try {
      const result = await check({ postId });
      if (result.publishedCaption !== undefined)
        setComparison({ postId, caption: result.publishedCaption });
      if (result.status === "inProgress") {
        setError("Your link is saved. A check was started recently. Try again in a moment.");
      }
    } catch {
      setError("Your link is saved. We couldn’t check the X post right now. Try again shortly.");
    }
  }

  async function run(operation: () => Promise<void>) {
    if (submitting.current) return;
    submitting.current = true;
    setError(undefined);
    try {
      await operation();
    } finally {
      submitting.current = false;
      setPhase(undefined);
    }
  }

  function changeUrl(value: string) {
    setUrl(value);
    setInvalidUrl(false);
    setError(undefined);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run(async () => {
      setPhase("saving");
      let postId: Id<"posts">;
      try {
        const input = url.trim();
        postId = post
          ? (await replace({ postId: post._id, url: input }))._id
          : await create({ submissionId, url: input });
      } catch (failure) {
        if (
          errorCode(failure) === "invalid_state" &&
          failure instanceof ConvexError &&
          (failure.data as { reason?: string }).reason === "url_invalid"
        ) {
          setInvalidUrl(true);
          return;
        }
        setError(
          errorMessage(failure, {
            conflict: "This link is already in use, or a link was just saved for this draft.",
          }),
        );
        return;
      }
      setEditing(false);
      setShowRevisionNote(false);
      await checkPost(postId);
    });
  }

  if (!active && !post) return null;
  const checking = phase === "checking" && (!post || checkingPost === post._id);
  const mismatch = post?.captionCheck === "mismatch" && !post.isVerified;
  const showForm = active && !post?.isVerified && (!post || editing) && !checking;
  const needsReview = post?.captionCheck === "match" || post?.captionCheck === "manualReview";
  const showMismatch = mismatch && !showForm && !phase;
  const publishedCaption = comparison?.postId === post?._id ? comparison?.caption : undefined;

  let title = "Add post link";
  let description = "Publish your approved draft on X, then paste the link here.";
  if (post?.isVerified) {
    title =
      post.captionCheck === "match"
        ? "It’s a match. Your post has been verified."
        : "Your post has been verified.";
    description = "You can view the verified post on X.";
  } else if (showMismatch) {
    title = "This post doesn’t match your submission";
    description =
      "Check that the link points to your X account and the caption matches the approved draft.";
  } else if (phase === "saving") {
    title = "Saving post link…";
  } else if (checking) {
    title = "Checking published caption…";
    description = "We’ll compare your post’s caption with the approved draft.";
  } else if (post && !showForm) {
    title = "Post link saved";
    description =
      post.captionCheck === "match" && mediaId
        ? "The caption matches. A reviewer will verify the published video."
        : needsReview
          ? "A reviewer will finish verifying your post."
          : "You can check the saved link again.";
  }

  function editLink() {
    if (!post) return;
    changeUrl(post.url);
    setEditing(true);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (phase) return;
        setOpen(next);
        if (!next) {
          setEditing(false);
          setError(undefined);
          setInvalidUrl(false);
          setShowRevisionNote(false);
        }
      }}
    >
      <DialogTrigger
        render={<Button type="button" size="sm" variant={post ? "secondary" : "primary"} />}
      >
        {post ? "View published post" : "Add post link"}
      </DialogTrigger>
      <DialogContent
        initialFocus={false}
        className={cn(
          "max-w-[1186px] [align-content:safe_center] overflow-y-auto rounded-lg px-5 py-14 shadow-page sm:px-10 md:min-h-[min(79.4dvh,780px)]",
          checking &&
            "sm:[&>[data-slot=dialog-close]]:top-8 sm:[&>[data-slot=dialog-close]]:right-8 [&>[data-slot=dialog-close]]:size-6 [&>[data-slot=dialog-close]]:items-center [&>[data-slot=dialog-close]]:justify-center [&>[data-slot=dialog-close]>svg]:size-4",
        )}
        overlayClassName="bg-gray-950/20 backdrop-blur-[2px]"
      >
        <div className={cn("mx-auto w-full max-w-[912px]", checking ? "space-y-8" : "space-y-5")}>
          <div className={cn("grid gap-5", (showMismatch || checking) && "sm:grid-cols-2")}>
            <div
              className={cn(
                "relative min-w-0",
                checking ? "space-y-5" : "space-y-4",
                !showMismatch && !checking && "mx-auto w-full max-w-[446px]",
              )}
            >
              {checking && (
                <p className="text-center text-body font-medium text-gray-500">
                  The content you submitted
                </p>
              )}
              <SubmissionPreview caption={caption} compact={checking}>
                {mediaId && <SubmittedVideo mediaId={mediaId} eager />}
              </SubmissionPreview>
              {showMismatch && (
                <p className="text-center text-body-sm text-gray-500">The content you submitted</p>
              )}
              {post?.isVerified && <ResultIcon />}
            </div>
            {checking && (
              <div className="min-w-0 space-y-5">
                <p className="text-center text-body font-medium text-gray-500">
                  What we pulled from the URL
                </p>
                <div className="space-y-4 rounded-lg bg-gray-0 p-4 shadow-raised" aria-hidden>
                  <div className="flex items-center gap-3">
                    <div className="size-12 shrink-0 rounded-full bg-gray-50" />
                    <div className="w-28 space-y-1.5">
                      <div className="h-3.5 rounded-full bg-gray-50" />
                      <div className="h-2.5 w-3/4 rounded-full bg-gray-50" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="h-3.25 rounded-full bg-gray-50" />
                    <div className="h-3.25 w-[54%] rounded-full bg-gray-50" />
                  </div>
                  {mediaId && <VideoSkeleton />}
                </div>
              </div>
            )}
            {showMismatch && (
              <div className="min-w-0 space-y-4">
                <div className="relative space-y-4 rounded-lg bg-gray-0 p-4 shadow-raised">
                  <ResultIcon mismatch />
                  <div className="flex items-center gap-3">
                    <span className="size-8 shrink-0 rounded-full bg-gray-100" aria-hidden />
                    <p className="text-body-sm font-medium">Published post</p>
                  </div>
                  {publishedCaption !== undefined && (
                    <p className="text-body-sm break-words whitespace-pre-wrap">
                      {publishedCaption || "This post has no caption."}
                    </p>
                  )}
                  {post && <XLink url={post.url} />}
                </div>
                <p className="text-center text-body-sm text-gray-500">
                  What we pulled from the URL
                </p>
              </div>
            )}
          </div>

          {checking ? (
            <div className="mx-auto flex w-fit max-w-full items-center gap-4 rounded-lg bg-gray-0 p-4 shadow-page">
              <DialogTitle className="sr-only">Checking published caption</DialogTitle>
              <DialogDescription className="sr-only">
                Comparing the published post with your approved submission
              </DialogDescription>
              <ProgressRing
                value={40}
                size="md"
                showLabel={false}
                label="Checking to see if it’s a match"
                aria-valuenow={undefined}
                className="motion-safe:animate-spin"
              />
              <p className="text-body font-medium">Checking to see if it’s a match...</p>
            </div>
          ) : showForm ? (
            <form
              className="mx-auto max-w-[446px] space-y-5 rounded-lg bg-gray-0 p-5 shadow-raised"
              onSubmit={save}
              noValidate
            >
              <div className="flex items-start gap-3">
                <IconContainer tone="success" />
                <div className="space-y-2">
                  <DialogTitle className="sr-only">{title}</DialogTitle>
                  <DialogDescription className="text-gray-950">
                    Your submission has been approved. Upload the post to X and submit the link
                    here.
                  </DialogDescription>
                </div>
              </div>
              <div className="space-y-2">
                <label htmlFor={inputId} className="block text-body-sm text-gray-500">
                  Post URL
                </label>
                <Input
                  id={inputId}
                  type="url"
                  required
                  maxLength={2048}
                  value={url}
                  placeholder="https://x.com/username/status/…"
                  disabled={!!phase}
                  aria-invalid={invalidUrl || undefined}
                  aria-describedby={invalidUrl ? `${inputId}-error` : undefined}
                  onChange={(event) => changeUrl(event.target.value)}
                  onBlur={(event) => {
                    if (event.target.value.trim() && !event.target.validity.valid)
                      setInvalidUrl(true);
                  }}
                />
                {invalidUrl && (
                  <p id={`${inputId}-error`} role="alert" className="text-body-sm text-red-700">
                    Enter a valid URL for an X post.
                  </p>
                )}
              </div>
              {error && (
                <p role="alert" className="text-body-sm text-red-700">
                  {error}
                </p>
              )}
              <div className="space-y-2.5">
                <Button
                  type="submit"
                  size="sm"
                  className="w-full"
                  disabled={!!phase || invalidUrl || !url.trim()}
                >
                  {phase ? "Saving…" : "Submit"}
                </Button>
                {!post && (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary-ghost"
                      className="w-full"
                      aria-expanded={showRevisionNote}
                      onClick={() => setShowRevisionNote(!showRevisionNote)}
                    >
                      I want to change something
                    </Button>
                    {showRevisionNote && (
                      <p className="text-body-sm text-gray-700">
                        Contact the campaign team before publishing if you need to change the
                        approved draft.
                      </p>
                    )}
                  </>
                )}
              </div>
            </form>
          ) : (
            <div className="mx-auto max-w-lg space-y-3 pt-4 text-center">
              {post && !post.isVerified && !mismatch && (
                <RiTimeLine size={24} className="mx-auto text-gray-700" aria-hidden />
              )}
              <div role="status" className="space-y-3">
                <DialogTitle
                  className={
                    post?.isVerified ? "text-body font-medium" : "text-[24px] leading-tight"
                  }
                >
                  {title}
                </DialogTitle>
                <DialogDescription>{description}</DialogDescription>
              </div>
              {post && !showMismatch && <XLink url={post.url} />}
            </div>
          )}

          {post && !showForm && !checking && (
            <div className="flex flex-wrap justify-center gap-3">
              {active && !post.isVerified && (
                <>
                  <Button type="button" disabled={!!phase} onClick={editLink}>
                    {mismatch ? "Resubmit URL" : "Replace link"}
                  </Button>
                  {!needsReview && (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={!!phase}
                      onClick={() => void run(() => checkPost(post._id))}
                    >
                      {mismatch ? "Check again" : "Check saved link"}
                    </Button>
                  )}
                </>
              )}
              {(post.isVerified || needsReview || !active) && (
                <Button
                  type="button"
                  className="min-w-40"
                  disabled={!!phase}
                  onClick={() => setOpen(false)}
                >
                  Done
                </Button>
              )}
            </div>
          )}

          {!showForm && error && (
            <p role="alert" className="mx-auto max-w-lg text-center text-body-sm text-red-700">
              {error}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Marks the verified or mismatched post card. */
function ResultIcon({ mismatch = false }: { mismatch?: boolean }) {
  const Icon = mismatch ? RiCloseLine : RiCheckLine;
  return (
    <span
      className={
        "absolute -top-3 -right-3 grid size-9 place-items-center rounded-full text-white " +
        (mismatch ? "bg-red-600" : "bg-gray-950")
      }
      aria-hidden
    >
      <Icon size={20} />
    </span>
  );
}

/** Opens the public post for the creator to inspect or edit on X. */
function XLink({ url }: { url: string }) {
  return (
    <a
      className="inline-block text-body-sm underline underline-offset-4"
      href={url}
      target="_blank"
      rel="noreferrer"
    >
      View post on X
    </a>
  );
}
