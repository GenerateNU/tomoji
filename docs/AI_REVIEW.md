# AI submission review

When `AI_REVIEW_ENABLED=true`, a media-backed AI submission queues a durable Convex
workflow in its creation transaction. The browser returns immediately and subscribes
to `submissions.get` or `submissions.list` for the `aiReview` summary.

The pipeline uses the completed, creator-owned immutable S3 video, AssemblyAI
Universal-2 (English, no paid add-ons), then pinned `jev-1.14.0`. Signed video URLs
are created internally for the provider, expire after one hour, and are never stored.
The worker rechecks the attempt, pending submission, active assignment, and media
ownership before provider work. Client-supplied draft URLs are never transcribed.

`submissions.create` accepts a completed video `mediaId`, a nonblank `caption`,
or both. Videos must belong to the creator and the same assignment. The optional
caption is separate from the required draft description. Existing video-only
rows remain valid.

Companies can set up to 20 explicit `{ id, description }` review criteria through
deliverable create/update. AI-enabled opportunities require criteria on every
deliverable when created, enabled, published, resumed, or edited; manual-review
opportunities may clear them with `[]`. Existing assignment locking applies.
Creators receive normalized criteria alongside the deliverable text, with `[]`
when none are stored.

## Inputs and decisions

The attempt snapshots the confirmed criteria, opportunity brief, and submitted
caption. Jev evaluates the caption and the video transcript when available. It
honors the source specified by each criterion and treats source text as evidence.
A caption-only draft skips transcription.

After publication, an operator can run `posts.checkCaption({ postId })` to compare
the approved caption with the linked X post. The comparison uses Unicode NFC,
consistent line endings, and trimmed outer whitespace. When X identifies an
appended media link in its URL metadata, the check omits that link. Case,
punctuation, and internal spacing remain significant. Creator-authored links
remain in the comparison, so links rewritten by X can produce a mismatch. The
check returns `match`, `mismatch`, or `no_caption`. It uses the existing app-only `X_BEARER_TOKEN` and leaves the
verification decision with the operator. The authenticated lookup still needs a
live test.

Convex applies the policy in `convex/lib/ai/reviewPolicy.ts`:

| Evidence                                                                              | Outcome                                    |
| ------------------------------------------------------------------------------------- | ------------------------------------------ |
| Every criterion is `met` with selected probability >= 0.80                            | Approve                                    |
| At least one `not_met` >= 0.80, with no uncertainty/low probabilities                 | Request changes, naming unmet requirements |
| Uncertain, low probability, no usable evidence, invalid response, or provider failure | Leave pending for company review           |

A selected `met` or `not_met` below the cutoff is recorded as `low_probability`;
`uncertain` means the classifier actually selected that option. Neither fallback
changes the submission out of pending. The cutoff uses the selected option's
probability, not Jev's separate `confidence` statistic.

The selected-probability cutoff is now 0.80. Explicit `uncertain` answers still
require manual review at any probability. This is an operating policy, not
measured accuracy. Company and AI
reviews share the decision/notification operation. Evidence, decision, and creator
notification commit together. Duplicate or stale completion cannot notify twice.
Company review is blocked while an enabled workflow is processing; fallback and
disabled automation permit company review. Existing operator override
behavior is unchanged.

## Recovery and limits

The workflow component permits five concurrent steps, not five concurrent provider
jobs. It retains completed steps across interruptions. Transcription POSTs are not
automatically retried: a dispatch reservation prevents another billed submission if
a response or database acknowledgement is lost. Ambiguous outcomes go to a person.

Polling runs at ten-second intervals, with at most 60 polls and three transient
poll failures. Jev gets at most three calls and reuses the stored transcript. Retries
honor provider backoff. Each HTTP request has a 15-second timeout; the attempt has a
ten-minute deadline. A separate scheduled deadline and workflow completion callback
release stopped workers to manual review. Disabling automation also stops further
provider calls and automatic decisions. Already submitted provider jobs are not canceled.

Videos over five minutes fall back based on AssemblyAI's returned duration. This
check happens **after transcription**: it does not cap the initial transcription bill
or replace the existing 250 MiB upload limit. No truncated transcript is approved as
a complete video review. A strict duration check before transcription requires trusted
media inspection and is not implemented here.

If `requestMayHaveSucceeded` is true, the attempt goes to manual review: both
AssemblyAI and Jev POSTs may already have incurred a charge. Timeouts use
`request_timeout`; GET timeouts and explicit 429 rejections can retry, while
ambiguous POSTs cannot. Malformed JSON remains non-retryable. Transcripts exceeding
8192 words fail with `review_input_too_large` rather than a malformed-response error.

## Setup and rollout

Set server-only `ASSEMBLYAI_API_KEY` and `TYPESAFE_API_KEY` together in `.env.local`.
`just convex-env` copies them to the selected Convex deployment when present. Neither
key is required for unrelated development. Never use a `NEXT_PUBLIC_` prefix.
`AI_REVIEW_ENABLED=false` is the default; copying credentials does not enable review.

Before enabling on a deployment:

- Align the two schema TODOs with Afnan's #177/#178 changes.
- Obtain TL approval for the threshold and the duration/cost limitation above.
- Agree on transcript retention, including provider and workflow journals. This PR
  does not add automatic deletion; raw evidence stays internal and must not be logged.
- Configure S3 access and both provider keys on that deployment.

There is no automatic historical backfill or replay of existing attempts. Existing
drafts containing removed fields from before #192 still follow that change’s
development reseed guidance.

## Verification

`bun run ci` checks types, lint, formatting, and tests. Provider contract tests mock
`fetch`; model tests exercise decisions, lifecycle guards, and notifications directly.
`convex/tests/aiReview.test.ts` drives the real workflow component with mocked S3
signing and provider responses under the existing Node action test project. It runs
without credentials, network calls, uploads, or provider charges.

A local provider check used a 17-second sponsored demo with product-name and
sponsorship criteria. The original prompt selected `met` for both, but the
sponsorship probability was 0.87, below the original 0.90 cutoff. Clarifying
whole-transcript evidence and spoken spelling variants made the sample pass on
three checks, including one with brief context. Missing/different sponsors,
negation, quoted disclosures, prompt injection, and a count requirement were
rejected; a visual-only requirement stayed manual. These are small diagnostic
controls, not a calibrated accuracy benchmark. No Convex deployment or live S3
workflow was exercised by this check.

API contracts: [AssemblyAI](https://www.assemblyai.com/docs/pre-recorded-audio/api-reference/transcripts/submit),
[Jev](https://docs.typesafe.ai/primitives/choice),
[Convex workflows](https://docs.convex.dev/agents/workflows).
