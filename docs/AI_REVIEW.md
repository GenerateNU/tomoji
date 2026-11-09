# AI review providers

The provider helpers in `convex/lib/ai/assemblyAi.ts` and `convex/lib/ai/jev.ts` are for
server-side actions. They do not create submissions, schedule work, write reviews,
or approve content. The submission foundation now prepares review state; provider
execution and approval policy follow in PR 3 for #162.

## Submission foundation

`submissions.create` requires a completed video `mediaId` owned by the creator and
bound to the same assignment. External draft URLs are no longer accepted or stored.
Before deploying this schema, reseed disposable development submissions that still
contain `draftUrl` or lack `mediaId`, as agreed in review. Do not clear shared or
production data without its owner's approval.

Companies can set up to 20 explicit `{ id, description }` review criteria through
deliverable create/update. AI-enabled opportunities require criteria on every
deliverable when created, enabled, published, resumed, or edited; manual-review
opportunities may clear them with `[]`. Existing assignment locking applies.
Creators receive normalized criteria alongside the deliverable text, with `[]`
when none are stored.

Media-backed AI drafts require confirmed criteria. The creation transaction snapshots
them and the opportunity context into `aiReviewAttempts` with status `ready`. It does
not enqueue work. Internal model operations claim an attempt, retain the transcription
job and transcript, and save results without changing submission approval. Every
write rejects stale attempts or submissions already reviewed/on inactive assignments.

The attempt table is new; the required submission media field is a breaking schema
change and needs the development reseed described above. Criteria and snapshot placement must
be aligned with #177/#178 before merge. Retry scheduling, duration enforcement,
provider execution, public processing-state reads and review notifications remain PR 3.

## Configuration and calls

Ask a TL for `ASSEMBLYAI_API_KEY` and `TYPESAFE_API_KEY`. Keep them in `.env.local`
for local tooling; never prefix them with `NEXT_PUBLIC_` or commit their values.
`readAiReviewConfig` validates supplied configuration when invoked. These helpers
receive keys explicitly; `.env.local` is not automatically available to Convex.
Deployment env declarations and setup-script wiring follow with the pipeline.

- `submitTranscription(key, videoUrl)` submits one fresh, server-authorized signed
  S3 URL using `speech_models: ["universal-2"]`, English, with no paid add-ons.
  Ownership and source-bucket authorization belong to the calling action.
- Persist the returned job ID, then call `getTranscription(key, id)` on later
  executions. It returns queued/processing/error or a completed transcript with
  word timestamps in milliseconds, duration in seconds, and the actual model.
  Silence produces empty text/words; it must not become automatic approval.
- `evaluateTranscript(key, transcript, criteria)` sends all criteria in one request
  to pinned `jev-1.14.0`. Each result retains its criterion ID, choice
  (`met`, `not_met`, `uncertain`), confidence, and probabilities. Input/output token
  counts are returned for cost accounting. No approval thresholds are chosen here.

## Failures and retries

Every HTTP request has a 15-second timeout and rejects redirects. Errors use
`apiError` with redacted `provider`, `reason`, and `retryable` details; HTTP errors
also include their status. No response bodies, signed URLs, or credentials are
included. A terminal transcription failure returns `status: "error"`.

There are no automatic retries or polling loops. The future orchestrator must
bound retries and honor provider backoff. If `requestMayHaveSucceeded` is true,
reconcile the attempt or send it to manual review: both AssemblyAI and Jev POSTs
may already have incurred a charge. Timeouts use `request_timeout` and are marked
retryable, but callers must still honor the ambiguous-POST flag before retrying.
Malformed JSON remains non-retryable. Transcripts exceeding 8192 words fail with
`review_input_too_large` instead of a malformed-response error.

Tests mock `fetch` under the existing edge-runtime Vitest project. Run:
`bun run test convex/tests/lib/ai/assemblyAi.test.ts convex/tests/lib/ai/jev.test.ts convex/tests/lib/ai/aiProvider.test.ts`.
They verify contracts and failure handling, not model accuracy or live latency.

API contracts: [AssemblyAI](https://www.assemblyai.com/docs/pre-recorded-audio/api-reference/transcripts/submit),
[Jev](https://docs.typesafe.ai/primitives/choice),
[Jev model versions](https://docs.typesafe.ai/models).
