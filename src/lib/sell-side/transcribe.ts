import "server-only";
import { MAX_AUDIO_BYTES, normalizeSegments } from "./types";

// Speech-to-text through the existing OpenRouter key. Transcripts carry
// timestamps but no speaker labels; nothing here attributes speech to speakers.
const TRANSCRIBE_MODEL = "qwen/qwen3-asr-0.6b";

export async function transcribeAudio(audio: Buffer, mimeType: string, offset: number) {
  if (!process.env.OPENROUTER_API_KEY) throw new Error("Call transcription is not configured (OPENROUTER_API_KEY).");
  if (!audio.length || audio.length > MAX_AUDIO_BYTES) throw new Error("Audio part must be between 1 byte and 24 MB.");
  const res = await fetch("https://openrouter.ai/api/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: TRANSCRIBE_MODEL,
      input_audio: { data: audio.toString("base64"), format: mimeType.includes("mp4") ? "mp4" : "webm" },
      response_format: "verbose_json",
      timestamp_granularities: ["segment"],
    }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) throw new Error(`Transcription provider returned ${res.status}. The audio is saved; retry processing.`);
  return normalizeSegments(await res.json(), offset);
}
