# Vision Nutrition Consistency Trace

## Goal

Add best-effort, structured evidence for comparing repeated `/vision-analysis`
requests without changing recognition, nutrition, persistence, or the public
response contract.

## Design

- Keep Flash, Plus, selected-result, backfill, and persistence summaries in
  request-local memory.
- Emit one `vision_recognition_trace` event through the existing
  `ops_metric_events` observability path after persistence resolves.
- Correlate the trace with `clientRequestId`, `analysisId`, `imageSha256`, and
  `imagePath`. Reuse the existing server-side SHA-256 of the stored/analysed
  bytes; do not add another hash implementation.
- Store bounded structured item summaries only; never store full model text.
- A trace write failure is logged/ignored and never changes the vision result.
- Do not change `/vision-analysis` fields, model selection, nutrition backfill,
  database schema, or meal-save behavior.

## Required invariants

1. Selected result and returned response are byte-for-byte behaviorally
   unchanged by tracing.
2. Flash/Plus skip, success, and fallback metadata identify the selected source
   and reason when available.
3. A successful request links `clientRequestId`, `analysisId`, and
   `imageSha256`; failed persistence records the missing `analysisId` and the
   persistence outcome.
4. Observability is best-effort: metric failure cannot fail `/vision-analysis`.

## Validation

Add focused tests for trace shape, Flash/Plus selection preservation,
correlation fields, persistence success/failure, and swallowed observability
errors. Run targeted vision tests plus the existing mini-program and CloudBase
verification gates.
