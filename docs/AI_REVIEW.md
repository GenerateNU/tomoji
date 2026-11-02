# AI submission review

When `AI_REVIEW_ENABLED=true`, a media-backed AI submission queues a durable Convex
workflow in its creation transaction. The browser returns immediately and subscribes
to `submissions.get` or `submissions.list` for the `aiReview` summary.

The pipeline uses the completed, creator-owned immutable S3 video, AssemblyAI
Universal-2 (English, no paid add-ons), then pinned `jev-1.14.0`. Signed video URLs
are created internally for the provider, expire after one hour, and are never stored.
The worker rechecks the attempt, pending submission, active assignment, and media
ownership before provider work. Client-supplied draft URLs are never transcribed.

## Inputs and decisions

Companies confirm up to 20 `{ id, description }` criteria on a deliverable before
assignment locking. The attempt snapshots those criteria and the opportunity brief.
Jev receives the snapshot as context, but evaluates only the explicit criteria.
Transcript content is evidence, not instructions. Visual content, captions, and
post-publication X matching are outside this version.

Convex applies the policy in `convex/lib/ai/reviewPolicy.ts`:

| Evidence                                                                   | Outcome                                    |
| -------------------------------------------------------------------------- | ------------------------------------------ |
| Every criterion is `met` with selected probability >= 0.90                 | Approve                                    |
| At least one `not_met` >= 0.90, with no uncertainty/low probabilities      | Request changes, naming unmet requirements |
| Uncertain, low probability, silence, invalid response, or provider failure | Leave pending for company review           |

The threshold is an initial operating policy, not measured accuracy. Company and AI
reviews share the decision/notification operation. Evidence, decision, and creator
notification commit together. Duplicate or stale completion cannot notify twice.
Company review is blocked while an enabled workflow is processing; fallback, legacy
URL drafts, and disabled automation permit company review. Existing operator override
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
URL submissions retain manual review. New attempt metadata is optional, so no data
migration is required for this PR; recheck schema compatibility before merging.

## Verification

`bun run ci` checks types, lint, formatting, and tests. Provider contract tests mock
`fetch`; model tests exercise decisions, lifecycle guards, and notifications directly.
`convex/tests/aiReview.test.ts` drives the real workflow component with mocked S3
signing and provider responses under the existing Node action test project. It runs
without credentials, network calls, uploads, or provider charges.

Live smoke testing, accuracy evaluation, and latency benchmarks are separate and
have not been performed for this implementation.

API contracts: [AssemblyAI](https://www.assemblyai.com/docs/pre-recorded-audio/api-reference/transcripts/submit),
[Jev](https://docs.typesafe.ai/primitives/choice),
[Convex workflows](https://docs.convex.dev/agents/workflows).
