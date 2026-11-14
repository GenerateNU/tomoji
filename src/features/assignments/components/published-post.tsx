"use client";

import { api } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import { useAction, useMutation } from "convex/react";
import { useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { RiCheckLine, RiCloseLine, RiTimeLine } from "@remixicon/react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useMe } from "@/features/users/hooks/use-me";
import { errorMessage } from "@/lib/errors";

type PublishedPostProps = {
  submissionId: Id<"submissions">;
  caption: string | undefined;
  startOpen: boolean;
  post: Doc<"posts"> | undefined;
  active: boolean;
  approvedVideo?: ReactNode;
};

/** Saves the published link and exposes the caption check separately from video verification. */
export function PublishedPost({
  submissionId,
  caption,
  post,
  active,
  approvedVideo,
  startOpen,
}: PublishedPostProps) {
  const create = useMutation(api.posts.create);
  const replace = useMutation(api.posts.replace);
  const check = useAction(api.posts.checkMyCaption);
  const inputId = useId();
  const [open, setOpen] = useState(startOpen);
  const [editing, setEditing] = useState(false);
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string>();
  const [checkingPost, setCheckingPost] = useState<Id<"posts">>();
  const [phase, setPhase] = useState<"saving" | "checking">();
  const submitting = useRef(false);

  async function checkPost(postId: Id<"posts">) {
    setCheckingPost(postId);
    setPhase("checking");
    try {
      if ((await check({ postId })) === "inProgress") {
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
        setError(
          errorMessage(failure, {
            invalid_state:
              "Use a link to an individual post on X. Check the link or refresh the assignment.",
            conflict: "This link is already in use, or a link was just saved for this draft.",
          }),
        );
        return;
      }
      setEditing(false);
      await checkPost(postId);
    });
  }

  if (!active && !post) return null;
  const checking = phase === "checking" && (!post || checkingPost === post._id);
  const mismatch = post?.captionCheck === "mismatch" && !post.isVerified;
  const showForm = active && !post?.isVerified && (!post || editing);
  const needsReview = post?.captionCheck === "match" || post?.captionCheck === "manualReview";
  const showMismatch = mismatch && !showForm && !phase;

  let title = "Add post link";
  let description = "Publish your approved draft on X, then paste the link here.";
  if (post?.isVerified) {
    title =
      post.captionCheck === "match"
        ? "It’s a match. Your post has been verified."
        : "Your post has been verified.";
    description = approvedVideo ? "Review is complete." : "You can view the verified post on X.";
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
      post.captionCheck === "match" && approvedVideo
        ? "The caption matches. A reviewer will verify the published video."
        : needsReview
          ? "A reviewer will finish verifying your post."
          : "You can check the saved link again.";
  }

  function editLink() {
    if (!post) return;
    setUrl(post.url);
    setError(undefined);
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
        }
      }}
    >
      <DialogTrigger
        render={<Button type="button" size="sm" variant={post ? "secondary" : "primary"} />}
      >
        {post ? "View published post" : "Add post link"}
      </DialogTrigger>
      <DialogContent
        className="max-w-[1186px] content-center overflow-y-auto rounded-2xl bg-gray-50 px-5 py-12 shadow-2xl sm:px-10 md:min-h-[min(76dvh,768px)]"
        overlayClassName="bg-gray-950/20 backdrop-blur-[2px]"
      >
        <div className="mx-auto w-full max-w-[800px] space-y-8">
          {showMismatch ? (
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="grid grid-rows-[auto_1fr] gap-3">
                <p className="text-center text-body-sm text-gray-500">Approved submission</p>
                <ApprovedCaption caption={caption}>{approvedVideo}</ApprovedCaption>
              </div>
              <div className="grid grid-rows-[auto_1fr] gap-3">
                <p className="text-center text-body-sm text-gray-500">Your post on X</p>
                <div className="relative space-y-3 rounded-xl border border-red-600 bg-gray-0 p-5">
                  <ResultIcon mismatch />
                  <p className="text-body-sm font-medium">Post could not be matched</p>
                  <XLink url={post.url} />
                </div>
              </div>
            </div>
          ) : post?.isVerified ? (
            <div className="relative mx-auto max-w-[380px]">
              <ApprovedCaption caption={caption}>{approvedVideo}</ApprovedCaption>
              <ResultIcon />
            </div>
          ) : null}
          <div className="mx-auto max-w-lg space-y-3 text-center">
            {post && !post.isVerified && !mismatch && !showForm && (
              <RiTimeLine size={28} className="mx-auto text-blue-primary" aria-hidden />
            )}
            <div role="status" className="space-y-3">
              <DialogTitle className="text-[24px] leading-tight">{title}</DialogTitle>
              <DialogDescription>
                {description}
                {approvedVideo && !post && " A reviewer will verify the posted video."}
              </DialogDescription>
            </div>
            {post && !showMismatch && !showForm && <XLink url={post.url} />}
          </div>

          {showForm && (
            <form className="mx-auto max-w-lg space-y-4" onSubmit={save}>
              <label htmlFor={inputId} className="block text-body-sm font-medium">
                X post URL
              </label>
              <Input
                id={inputId}
                type="url"
                required
                maxLength={2048}
                value={url}
                placeholder="https://x.com/username/status/…"
                disabled={!!phase}
                onChange={(event) => setUrl(event.target.value)}
              />
              <div className="grid grid-cols-2 gap-3">
                <Button
                  type="button"
                  variant="secondary-subtle"
                  disabled={!!phase}
                  onClick={() => (post ? setEditing(false) : setOpen(false))}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={!!phase}>
                  {post ? "Save new link" : "Check post link"}
                </Button>
              </div>
            </form>
          )}

          {post && !showForm && (
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

          {error && (
            <p role="alert" className="mx-auto max-w-lg text-center text-body-sm text-red-700">
              {error}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Shows the original approved text for comparison against the public post. */
function ApprovedCaption({
  caption,
  children,
}: {
  caption: string | undefined;
  children?: ReactNode;
}) {
  const me = useMe();
  const creator = me?.synced ? [me.firstName, me.lastName].filter(Boolean).join(" ") : "You";
  return (
    <div className="space-y-4 rounded-xl bg-gray-0 p-5">
      <div className="flex items-center gap-3">
        <span
          className="grid size-10 shrink-0 place-items-center rounded-full bg-indigo-100 text-indigo-700"
          aria-hidden
        >
          {creator[0]}
        </span>
        <p className="text-body-sm font-medium">{creator}</p>
      </div>
      <p className="text-body-sm break-words whitespace-pre-wrap">
        {caption || "No caption was submitted."}
      </p>
      {children}
    </div>
  );
}

/** Marks the verified or mismatched post card. */
function ResultIcon({ mismatch = false }: { mismatch?: boolean }) {
  const Icon = mismatch ? RiCloseLine : RiCheckLine;
  return (
    <span
      className={
        "absolute -top-3 -right-3 grid size-9 place-items-center rounded-full text-white " +
        (mismatch ? "bg-red-600" : "bg-blue-primary")
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
