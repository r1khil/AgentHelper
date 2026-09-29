import { sourceId } from "@/lib/providers/types";
import { ANALYSIS_ERROR } from "@/lib/sell-side/status";
import type { Segment } from "@/lib/sell-side/types";

// Pure helpers for the sell-side screen: timestamps, the call timeline strip and list statuses.
// The waveform is drawn from the transcript's timing, not from decoded audio, so it is deterministic.

export type TimelinePart = { seq: number; offset: string | number; duration: string | number; segments: Segment[] | null };

/** 04:12 under an hour, 1:04:12 after. */
export function stamp(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** "42 min" for the call length; "<1 min" for a short test recording. */
export function minutesLabel(seconds: number) {
  if (seconds <= 0) return "0 min";
  const m = Math.round(seconds / 60);
  return m < 1 ? "<1 min" : `${m} min`;
}

export function callLength(parts: TimelinePart[]) {
  return parts.reduce((total, p) => total + Number(p.duration), 0);
}

const words = (text: string) => new Set(text.toLowerCase().match(/[a-z0-9$%.]{4,}/g) ?? []);

/**
 * When a brief point was said: the transcript part it cites, then the segment in that part whose wording
 * overlaps the point most (the earliest one on a tie). Null when the point cites no saved part.
 */
export function pointTime(point: { text: string; sourceIds: string[] }, parts: TimelinePart[], callId: string): number | null {
  const bySource = new Map(parts.map((p) => [sourceId("call", `${callId}:${p.seq}`), p]));
  const part = point.sourceIds.map((id) => bySource.get(id.trim().replace(/^\[?src:(.+?)\]?$/, "$1"))).find((p) => p !== undefined);
  if (!part) return null;
  const segments = part.segments ?? [];
  if (!segments.length) return Number(part.offset);
  const want = words(point.text);
  let best = segments[0];
  let bestScore = -1;
  for (const s of segments) {
    let score = 0;
    for (const w of words(s.text)) if (want.has(w)) score++;
    if (score > bestScore) {
      best = s;
      bestScore = score;
    }
  }
  return best.start;
}

/** A small deterministic hash in [0, 1) so the bars look like audio without random output. */
function jitter(i: number) {
  let h = Math.imul(i + 1, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Bar heights (0..1) for the call timeline: how densely words were spoken in each slice of the call.
 * Silent slices get a low stub; talk gets a height from the speaking rate plus a little texture.
 */
export function waveform(segments: Segment[], total: number, bars = 96): number[] {
  if (!(total > 0) || !segments.length) return [];
  const width = total / bars;
  const rate = new Array<number>(bars).fill(0);
  for (const s of segments) {
    const length = Math.max(0.5, s.end - s.start);
    const perSecond = s.text.trim().length / length;
    const first = Math.max(0, Math.floor(s.start / width));
    const last = Math.min(bars - 1, Math.floor(Math.max(s.start, s.end - 1e-6) / width));
    for (let i = first; i <= last; i++) {
      const overlap = Math.min(s.end, (i + 1) * width) - Math.max(s.start, i * width);
      if (overlap > 0) rate[i] += (perSecond * overlap) / width;
    }
  }
  const max = Math.max(...rate);
  if (!(max > 0)) return rate.map(() => 0.12);
  return rate.map((r, i) => (r <= 0 ? 0.12 : Math.min(1, 0.22 + 0.78 * (r / max) * (0.35 + 0.65 * jitter(i)))));
}

export type ListStatus = { label: string; tone: "caution" | "muted" };

/**
 * The short status on a saved-call row, in words: "brief ready", "transcribing 64%", "transcription failed · retry".
 * Amber while something is running or needs a retry, grey otherwise. `parts`/`transcribed`/`summarized` count the
 * saved audio sections; `error` tells a failed analysis from a failed transcription.
 */
export function listStatus(call: { status: string; expectedParts: number | null; error?: string | null }, counts: { parts: number; transcribed: number; summarized: number }): ListStatus {
  const total = call.expectedParts ?? counts.parts;
  const pct = (n: number) => (total ? Math.min(100, Math.round((n / total) * 100)) : 0);
  switch (call.status) {
    case "ready":
      return { label: "brief ready", tone: "muted" };
    case "error":
      return { label: call.error === ANALYSIS_ERROR ? "analysis failed · retry" : "transcription failed · retry", tone: "caution" };
    case "transcribing":
      return { label: `transcribing ${pct(counts.transcribed)}%`, tone: "caution" };
    case "summarizing":
      return { label: `key points ${pct(counts.summarized)}%`, tone: "caution" };
    case "analyzing":
      return { label: "checking files", tone: "caution" };
    default:
      return { label: counts.parts ? "audio saved" : "ready to record", tone: "muted" };
  }
}
