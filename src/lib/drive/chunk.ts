/** Split extracted document text into overlapping chunks for embedding. Pure. */
export const CHUNK_CHARS = 1_500;
export const CHUNK_OVERLAP = 200;
export const MAX_CHUNKS_PER_FILE = 200;

export type Chunk = { seq: number; text: string; start: number };

/** Boundaries that must not be merged across: slide separators and sheet headers emitted by text.ts. */
const HARD_BREAK = /^(--- Slide \d+ ---|## Sheet .+)$/m;

function paragraphs(text: string): { text: string; start: number }[] {
  const out: { text: string; start: number }[] = [];
  const re = /\n\s*\n/g;
  let pos = 0;
  let m: RegExpExecArray | null;
  const push = (from: number, to: number) => {
    const raw = text.slice(from, to);
    const lead = raw.length - raw.trimStart().length;
    const t = raw.trim();
    if (t) out.push({ text: t, start: from + lead });
  };
  while ((m = re.exec(text))) {
    push(pos, m.index);
    pos = m.index + m[0].length;
  }
  push(pos, text.length);
  return out;
}

/** Break an oversized paragraph on sentence ends or line breaks, falling back to a hard cut. */
function splitLong(p: { text: string; start: number }, size: number): { text: string; start: number }[] {
  if (p.text.length <= size) return [p];
  const out: { text: string; start: number }[] = [];
  let i = 0;
  while (i < p.text.length) {
    let end = Math.min(p.text.length, i + size);
    if (end < p.text.length) {
      const window = p.text.slice(i, end);
      const cut = Math.max(window.lastIndexOf(". "), window.lastIndexOf("\n"), window.lastIndexOf("; "));
      if (cut > size * 0.4) end = i + cut + 1;
    }
    const t = p.text.slice(i, end).trim();
    if (t) out.push({ text: t, start: p.start + i });
    i = end;
  }
  return out;
}

export function chunkText(text: string, opts: { size?: number; overlap?: number; max?: number } = {}): Chunk[] {
  const size = opts.size ?? CHUNK_CHARS;
  const overlap = Math.min(opts.overlap ?? CHUNK_OVERLAP, Math.floor(size / 2));
  const max = opts.max ?? MAX_CHUNKS_PER_FILE;
  const chunks: Chunk[] = [];
  if (!text.trim()) return chunks;

  let buf = "";
  let bufStart = 0;
  let prevTail = "";
  const flush = () => {
    if (!buf.trim()) return;
    const body = buf.trim();
    chunks.push({ seq: chunks.length, text: prevTail ? `${prevTail}\n${body}` : body, start: bufStart });
    prevTail = overlap > 0 ? body.slice(-overlap).trimStart() : "";
    buf = "";
  };

  for (const p of paragraphs(text).flatMap((p) => splitLong(p, size))) {
    if (chunks.length >= max) break;
    const hard = HARD_BREAK.test(p.text);
    if (buf && (hard || buf.length + 2 + p.text.length > size)) flush();
    if (!buf) bufStart = p.start;
    buf = buf ? `${buf}\n\n${p.text}` : p.text;
  }
  if (chunks.length < max) flush();
  return chunks;
}

/** A short header prepended to each chunk before embedding (not stored) so retrieval knows what the passage is from. */
export function chunkHeader(meta: { name: string; ticker: string | null; kind: string | null; docDate?: string | null }): string {
  return [meta.ticker, meta.kind?.replace(/_/g, " "), meta.name, meta.docDate].filter(Boolean).join(" · ");
}
