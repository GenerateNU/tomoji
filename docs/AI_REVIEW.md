# AI review providers

The provider helpers in `convex/lib/ai/assemblyAi.ts` and `convex/lib/ai/jev.ts` are for
server-side actions. They do not create submissions, schedule work, write reviews,
or approve content. Submission/schema integration follows in separate PRs for #162.

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
reconcile the attempt or send it to manual review: do not submit another billed
transcription blindly. Retrying Jev can also incur another inference charge.

Tests mock `fetch` under the existing edge-runtime Vitest project. Run:
`bun run test convex/tests/lib/ai/assemblyAi.test.ts convex/tests/lib/ai/jev.test.ts convex/tests/lib/ai/aiProvider.test.ts`.
They verify contracts and failure handling, not model accuracy or live latency.

API contracts: [AssemblyAI](https://www.assemblyai.com/docs/pre-recorded-audio/api-reference/transcripts/submit),
[Jev](https://docs.typesafe.ai/primitives/choice),
[Jev model versions](https://docs.typesafe.ai/models).
