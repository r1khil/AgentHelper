# Sell-side analyzer

The team sidebar opens `/t/[team]/sell-side`. Select an existing holding, create a call, and record microphone audio (speakerphone) or microphone plus a browser tab's shared audio. Calls and follow-up chats are shared within the existing team access rules.

## Architecture

- Calls link to the existing `chats` table. The summary and subsequent questions use `runAgentTurn`, `ChatPanel`, its tool activity, and the shared citation registry/viewer.
- Browser MediaRecorder creates independent two-minute audio files, up to 120 parts. IndexedDB retains pending files until confirmed uploaded through the existing signed Supabase Storage helpers. Uploads go directly to the private `models` bucket under server-derived `calls/<team>/<call>/<seq>` paths, avoiding Next/Vercel request-body limits.
- Each processing request transcribes and summarizes at most one part. Transcripts are saved before summarization, completed parts are skipped on retries, and a database lease prevents concurrent processors. A six-minute stale lease can be reclaimed after a crashed worker.
- OpenAI `gpt-4o-transcribe-diarize` uses `diarized_json` and automatic chunking. Labels are explicitly local to each part; the app does not infer participant identity across parts. Exact text and offset timestamps are retained.
- Analysis deterministically invokes the existing `find_drive_files`, `search_drive_text`, and `read_drive_file` tools for the company before invoking the existing agent. It reads up to three indexed documents as a fallback when embeddings are unavailable. Retrieval failures are included in the evidence, not converted into agreement. The agent can retrieve additional passages with its existing tools.
- The initial saved answer has sections for executive summary, speaker views, claims/numbers, catalysts, risks, open questions, and an internal-file cross-check. Comparisons require call and internal-document citations. No holding notes, models, or analyst price targets are modified.
- `find_call_transcripts` adds team-scoped Postgres full-text search to the existing agent tool registry. `read_call_transcript` pages the complete saved call. Transcript sources use the existing source endpoint and viewer, with the same chat membership and source provenance checks as Drive documents. No second citation or chat system is introduced.

## Deployment

1. Apply `npx tsx scripts/apply-sql.ts drizzle/0011_sell_side.sql` to the intended development/deployment database. Like the other handwritten migrations, this is not in the Drizzle journal. New tables have RLS enabled and are accessed only through team-checked server code.
2. Configure `OPENAI_API_KEY` for transcription, alongside the existing `OPENROUTER_API_KEY`, database, and Supabase variables. The existing Drive connection supplies company documents.
3. Ensure the existing **private** `models` storage bucket accepts `audio/webm` (including codecs parameter) and `audio/mp4`, with a per-file limit of at least 24 MB. Do not make the bucket public. There are no new anonymous storage read policies.
4. Serve over HTTPS (localhost also supports browser media APIs). For browser calls, choose the tab and explicitly share audio. Browser/OS support for system audio varies; microphone mode does not capture remote headphone audio.

## Recovery and limits

Keep the tab open during recording and part processing. The in-progress part is not saved until its two-minute boundary or Stop; a crash can lose that current part. Short gaps can occur while MediaRecorder restarts. Pause does not add silence to transcript timestamps. Closing while processing is recoverable by reopening the call and using **Process / retry saved call**. After analysis starts, the existing server-owned agent run finishes independently of browser navigation.

Pending audio can be downloaded before retry. Browser-local recovery is specific to the same browser profile; clearing site data removes pending files. Saved transcripts remain in Postgres. Audio objects are private and retained; this feature does not introduce automatic audio deletion or retention policy changes.

Do not treat speaker labels as verified identities or a missing internal document as confirmation. The internal-file cross-check displays retrieved evidence and gaps for analyst review.

## Verification

Unit/integration fixtures cover diarization parsing, timestamp offsets, missing parts, transcription reuse after model failures, deterministic internal retrieval/fallback, saved citation provenance, auth/team checks, concurrent leases, and background failure recovery. Browser verification uses actual MediaRecorder/IndexedDB with synthetic audio and simulated storage/provider responses, covering pause/resume, multi-part rotation, upload retry, processing, transcript search, and reopening saved state. This is separate from a live test of microphone capture, Supabase, OpenAI, and the connected Drive, which requires a configured development environment.

### Validation performed on this branch

- `npm test`: 318 tests across 45 files passed.
- `npm run typecheck` and `npm run lint`: passed.
- `npm run build -- --webpack`: passed. Default Turbopack encountered an environment port-binding restriction; no bundler configuration was changed.
- Local PostgreSQL (PGlite) executed the migration twice and exercised the actual store functions: save/reopen, full-text retrieval, ticker filtering, team isolation, transcript paging, and citation metadata.
- Browser harness: real MediaRecorder and IndexedDB, synthetic audio, mocked storage/transcription/analysis boundaries. Passed call creation, permission denial, pause/resume, two-part rotation, upload failure, local recovery after reload, processing retry, saved transcript search/reopen, mobile width, and page-error checks. Caught and fixed the explicit submit type on the new-call button.
- Live service validation was unavailable: the main local clone and registered worktrees had no usable `.env` / `.env.local` with the required database, storage, and provider configuration. No secrets were printed; no live schema, account data, or deployment was modified.
