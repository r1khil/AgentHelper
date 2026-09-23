# Sell-side analyzer

The sidebar opens `/t/[team]/sell-side`. Choose a holding or **Other company**, enter a company name and ticker, and create a call. Other-company calls belong to the team with no holding link; the company name is preserved in the call title. Calls, transcripts and follow-up chats follow the existing team access rules.

## Pipeline and recovery

1. The existing MediaRecorder records microphone audio or microphone plus shared browser-tab audio. Independent two-minute files, up to 120, are saved in IndexedDB until uploaded through the existing signed Supabase Storage helpers. Audio stays in the private `models` bucket; requests never proxy large audio through Next.
2. One request transcribes one pending part with the existing OpenRouter key and `qwen/qwen3-asr-0.6b`. Offset timestamps and text are persisted immediately. This provider does not supply speaker labels; the app does not invent attribution.
3. A separate request extracts structured part notes from saved text. The split keeps transcription and generation within the function runtime limit. Retries skip saved transcription and completed notes. A database lease prevents concurrent processing; an expired lease can be reclaimed after six minutes.
4. The existing `find_documents`, `search_documents`, and `read_document` tools retrieve company evidence. `kind: drive` keeps the initial cross-check scoped to internal files after the unified-corpus changes. Up to three documents are read as a fallback when search/embeddings are unavailable. Metadata-only listings cannot support a comparison.
5. A validated structured brief is saved in the existing chat's message metadata, alongside normal Markdown and the existing tool/source messages. It includes an overview, key points, important numbers with units/periods, positive commentary, risks, themes, catalysts, questions and an internal-file cross-check. Unknown source IDs and comparisons without internal evidence are rejected before the call becomes ready. Old Markdown-only calls remain readable.
6. The brief and transcript have their own sections. Opening **Discuss this call** mounts the existing `ChatPanel`; subsequent questions still use `runAgentTurn`, its tools, citation registry, source viewer, persistence and current memory pipeline. The initial brief stays in view when processing completes.
7. `find_call_transcripts` and `read_call_transcript` continue to expose saved transcripts to later research chats through team-scoped full-text retrieval. The existing `/api/sources/[documentId]` route verifies both chat access and source provenance before opening a transcript or internal document.

No holding notes, models, price targets or portfolio positions are modified. A missing internal document is not agreement. Other-company analysis still runs when no internal files are available, with the evidence gap stated explicitly.

### Missing part-summary diagnosis

The old part-note request used `generateText`, a 700-token output cap and `result.text`, with no structured schema. A reasoning-capable provider can consume that budget entirely on reasoning, finish with `length`, and return an empty visible answer. The actual installed OpenRouter provider/AI SDK reproduces this behavior in `generate.test.ts`; it is not a JSON field-parsing mismatch. Production request logs were unavailable, so the specific failed production response could not be inspected.

The fix uses `Output.object` with Zod validation, the existing `OPENROUTER_SUMMARY_MODEL` selection (falling back to the configured agent model), low reasoning effort and 8,000 output tokens. Incomplete or invalid output gets one retry with 12,000 tokens. Providers that explicitly reject JSON schema get a JSON-text fallback with the same schema validation. Authentication/configuration failures are not converted into successful summaries. Reasoning text is never used as the answer.

### Free-tier provider fit

Production runs with free OpenRouter models. In September 2026 the Ling 3.0 Flash Fin endpoint was routed to a provider that rejects JSON-schema output (HTTP 400), and its plain-JSON fallback answers missed fields such as `followUp`, so every brief failed strict validation. Nemotron 3 Ultra honored the schema but exceeded the 100-second per-attempt budget from Vercel. Three changes make the brief robust to this class of provider:

- **Repair before reject.** `repairAnalysis` normalizes near-miss output: it strips `[src:…]` wrappers, drops unknown source ids and any item without transcript evidence, fills missing follow-up/evidence/coverage text, downgrades Supports/Contradicts rows that cite no internal file to Not retrieved, and adds a Not retrieved placeholder when no cross-check came back. Only the overview and cross-check rows may fall back to the call's own transcript sources; nothing else is invented. The result still passes `callAnalysisSchema` and `validateAnalysis`. Repair runs on the JSON-text fallback and on structured output the SDK rejected; markdown-only answers still fail.
- **Longer attempts.** Each model attempt gets 120 seconds; two attempts plus retrieval stay inside the route's 300-second limit.
- **Smaller prompt.** Document reads are capped at 6,000 characters, and saved evidence from older calls is trimmed to the same size in the prompt copy only, so stored messages are unchanged.

Server diagnostics record only stage, error class, HTTP status, finish reason and token counts. Provider bodies, transcript contents, API keys and raw exception messages are not logged or returned by the analysis error path. The UI offers **Retry analysis** or **Retry transcription** according to the failed stage. A final-analysis retry skips audio upload, transcription and completed part notes. A fast-completion race is also fixed: reaching `ready` refreshes the server-rendered brief even if analysis finished before polling started.

## Deployment

For an installation already using sell-side calls, the only new database step is:

```bash
npx tsx scripts/apply-sql.ts drizzle/0014_sell_side_other_company.sql
```

Run against the intended database using its existing environment configuration. Alternatively, execute the single SQL statement in the Supabase SQL editor. It drops `NOT NULL` from `sell_side_calls.holding_id`; the foreign key, existing rows and RLS remain intact. It is safe to run again. This handwritten migration is not in the Drizzle journal.

Apply it before using **Other company**. Existing holding calls and chat reads remain compatible if code deploys first; other-company creation returns a clear setup message and rolls back its transaction until the migration is applied. For a fresh installation, also apply `0011_sell_side.sql` first.

Continue using the existing database/Supabase variables and `OPENROUTER_API_KEY`. No new credential is required. The private `models` bucket must accept `audio/webm` (including the codecs variant) and `audio/mp4` up to 24 MB per file. Do not add anonymous read policies. HTTPS or localhost is required for media capture.

## Recording limits

Keep the page open during recording and part processing. The current part is saved at its two-minute boundary or Stop; a browser crash can lose that unfinished part, and short gaps can occur when MediaRecorder restarts. Pause does not add silence to transcript offsets. Audio pending upload can be downloaded. Local recovery requires the same browser profile; clearing site data removes pending files. Already uploaded audio and saved transcripts remain available when reopening the call. Final synthesis continues server-side after navigation.

## Verification

- `npm test`: 460 tests across 68 files, including real SDK response parsing, malformed/empty outputs, schema fallback, configured model selection, citation validation, company validation, auth/team isolation, leases, saved-transcript reuse and final-analysis retries.
- `npm run typecheck`, `npm run lint`, and `npm run build -- --webpack` validate the integrated application.
- `npm run test:sell-side:browser` starts an isolated local integration app and Chrome (requires installed Chrome), then cleans up its server. It uses the production form, recorder, IndexedDB, analysis components, chat, source viewer, APIs, SQL migrations, store functions, processing code, provider SDK and streamed agent persistence. Auth, object storage, transcription/model HTTP responses and internal-document retrieval are deterministic fixtures. It never reads production env files or adds an auth bypass to the application.
- Browser scenarios: a non-portfolio SNOW call; an AMZN holding call; record/pause/resume and two-minute rollover; reasoning-only part-note failure; final-analysis failure; retries without duplicate transcription; structured brief; transcript and internal-source opening; streamed follow-up with a valid citation; reload/reopen; transcript search; later full-text retrieval; other-team isolation; desktop/mobile layout and uncaught page errors. Screenshots are written under `.artifacts/sell-side-test/`.
- PostgreSQL migrations execute in PGlite, including applying the nullable-holding migration twice. Persisted non-portfolio calls, messages, full-text sources and holding calls are exercised by the browser flow.

The branch incorporates main through `376198c`: calendar and Owl's Nest branding, the holding research board, memory/MCP/earnings prep, unified document corpus and source endpoint, and ingest/embedding fixes. The existing chat/retrieval code is retained. The only schema change is the optional holding link.

Live OpenRouter/Supabase/Drive verification and production migration execution require an authenticated, configured environment. Neither the main local checkout nor the isolated checkout contained an env file during this repair; no production migration or live-provider success is claimed.
