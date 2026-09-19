# Research citations

The agent's `[src:ID]` syntax is an evidence reference, not a navigation URL. Previously the chat renderer rewrote it as `[ID](src:ID)`. `react-markdown` correctly strips unsupported schemes before calling the link renderer, so `src:ID` became `href=""` and clicking reloaded the current chat. The renderer's custom citation branch was never reached. Groups that repeated `src:` after each comma were also left unparsed.

## Pipeline

1. Retrieval tools return `Source` records alongside their data. Source records now optionally carry `documentId`, `sourceType`, `excerpt`, and `location` (page, section, text, offset). Filing/read tools retain the actual URL and known filing title/date. XBRL tools resolve primary documents from SEC submissions, falling back to the filing archive when unavailable. Drive sources retain exact indexed file identity and document date, distinct from modified time.
2. Each retrieved passage gets its own source ID so reading two sections or chunks does not overwrite the supporting evidence. Known filing metadata is passed into subsequent agent turns. XBRL previews identify their excerpt as structured XBRL facts rather than a verbatim quote.
3. The existing AI SDK tool parts and `chat_messages.parts` JSON persist source records unchanged. No migration is needed. `collectSources` supports static and dynamic tool parts, enriches old sources from saved tool data, and preserves existing destinations when IDs repeat. Model history compaction retains sources.
4. `remarkCitations` parses citations into structured Markdown nodes before URL sanitization. It supports adjacent tokens, both comma-group forms, and legacy Markdown `src:` links, without rewriting code blocks or weakening Markdown URL protection.
5. `ResearchSources` provides a shared source registry, stable numbers, preview UI and document viewer. `ResearchAnswer` renders prose; `Citation` renders either a compact reference or source-list entry. Wrap any additional research answer surface in the same provider to reuse this behavior.
6. `resolveSource` chooses a validated HTTP(S) URL, an exact internal document identity, or unavailable state. There are no empty anchors or chat-route fallbacks. External links use a new tab and `noopener noreferrer`. PDF page fragments and supported browser text fragments fall back naturally to the source document.
7. Internal citations open an in-app dialog using the existing Drive text index. The endpoint checks authentication, team access to the chat, and that the document was retrieved in that saved chat before reading it. Matching passages are highlighted and scrolled into view. If a passage changed, the viewer shows the document without an invented highlight; if extraction fails, it still offers the original document. Removed or inaccessible sources show an unavailable state. For a still-running turn, the viewer waits and retries automatically until the source is persisted; it does not mislabel an in-flight source as missing.

Missing dates or excerpts are labeled explicitly. External passage highlighting depends on browser support and how closely the publisher's HTML matches extracted text. The app's indexed document viewer displays extracted text, not original PDF pagination. Page links are used when page metadata exists for an external PDF.

## Validation

Automated tests cover the actual `react-markdown` sanitizer regression, all citation token forms, repeated citations and tables, code blocks, unsafe/missing URLs, metadata persistence, SEC filings and release metadata, primary XBRL URLs, distinct Drive passages, exact document reads, authentication/team access, deleted documents, extraction fallback, and passage matching.

Browser verification used the production React components with synthetic evidence and mocked internal document responses. It verified pointer-hover and keyboard-focus previews, source tabs for SEC and earnings URLs, exact-document display, scrolling/highlighting, changed-passage fallback, document-only fallback, and unavailable states. The authenticated live database/Drive path was tested with mocked service boundaries, not a production account. No model calls or live data mutations were needed.

Commands: `npm test`, `npm run lint`, `npm run typecheck`, and `npm run build -- --webpack`. The default Turbopack build was blocked by this development environment's CSS-worker port restriction; the production Webpack build passed.
