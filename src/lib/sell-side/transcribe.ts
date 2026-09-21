import "server-only";
import { MAX_AUDIO_BYTES, normalizeSegments } from "./types";

export async function transcribeAudio(audio: Buffer, mimeType: string, seq: number, offset: number) {
  if (!process.env.OPENAI_API_KEY) throw new Error("Speaker transcription is not configured (OPENAI_API_KEY).");
  if (!audio.length || audio.length > MAX_AUDIO_BYTES) throw new Error("Audio part must be between 1 byte and 24 MB.");
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(audio)], { type: mimeType }), mimeType.includes("mp4") ? "part.mp4" : "part.webm");
  form.append("model", "gpt-4o-transcribe-diarize");
  form.append("response_format", "diarized_json");
  form.append("chunking_strategy", "auto");
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: form,
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) throw new Error(`Transcription provider returned ${res.status}. The audio is saved; retry processing.`);
  return normalizeSegments(await res.json(), seq, offset);
}
