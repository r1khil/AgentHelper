"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Mic, Pause, Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { MODEL_BUCKET } from "@/lib/models/upload";
import { localParts, removeLocalPart, saveLocalPart, type LocalPart } from "@/lib/sell-side/local-audio";
import { ANALYSIS_ERROR, TRANSCRIPT_ERROR, callStatusLabel } from "@/lib/sell-side/status";
import { clock, MAX_AUDIO_BYTES, MAX_PARTS, PART_MS, type Segment } from "@/lib/sell-side/types";

type State = {
  call: { status: string; error: string | null; expectedParts: number | null; updatedAt: string };
  parts: { seq: number; offset: string; duration: string; segments: Segment[] | null; summary: string | null }[];
};
export function CallWorkspace({ callId, configured, children }: { callId: string; configured: boolean; children?: ReactNode }) {
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  const [data, setData] = useState<State | null>(null);
  const [error, setError] = useState("");
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [pending, setPending] = useState(0);
  const [tabAudio, setTabAudio] = useState(false);
  const [progress, setProgress] = useState("");
  const [filter, setFilter] = useState("");
  const [level, setLevel] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const streams = useRef<MediaStream[]>([]);
  const audioContext = useRef<AudioContext | null>(null);
  const keepRecording = useRef(false);
  const sequence = useRef(0);
  const offset = useRef(0);
  const activeMs = useRef(0);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const stopDone = useRef<(() => void) | null>(null);
  const uploading = useRef(false);
  const unsaved = useRef<LocalPart[]>([]);
  const report = (e: unknown) => setError(e instanceof Error ? e.message : String(e));
  const request = useCallback(
    async (body?: unknown) => {
      const res = await fetch(
        `/api/sell-side/${callId}`,
        body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" },
      );
      const result = await res.json().catch(() => null);
      if (!res.ok || !result) throw new Error(result?.error ?? "The request could not finish. Your saved work is safe; please retry.");
      return result;
    },
    [callId],
  );
  const refresh = useCallback(async () => {
    const next = await request();
    setData(next);
    setNow(Date.now());
    // Fast synthesis can finish before the first polling interval is installed.
    if (next.call.status === "ready") router.refresh();
    return next as State;
  }, [request, router]);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [state, local] = await Promise.all([request(), localParts(callId)]);
        if (active) {
          setData(state);
          setPending(local.length);
        }
      } catch (e) {
        if (active) report(e);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [callId, request]);
  useEffect(() => {
    if (data?.call.status !== "analyzing") return;
    const timer = setInterval(() => void refresh().catch(report), 3000);
    return () => clearInterval(timer);
  }, [data?.call.status, refresh, router]);
  useEffect(() => {
    if (!recording && !pending && !busy) return;
    const guard = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    const navigation = (e: MouseEvent) => {
      if ((e.target as Element).closest("a") && !window.confirm("Recording or processing is active. Stay here until audio is saved. Leave this page?"))
        e.preventDefault();
    };
    window.addEventListener("beforeunload", guard);
    document.addEventListener("click", navigation, true);
    return () => {
      window.removeEventListener("beforeunload", guard);
      document.removeEventListener("click", navigation, true);
    };
  }, [recording, pending, busy]);
  useEffect(
    () => () => {
      keepRecording.current = false;
      if (recorder.current?.state !== "inactive") recorder.current?.stop();
      streams.current.forEach((s) => s.getTracks().forEach((t) => t.stop()));
      void audioContext.current?.close();
    },
    [],
  );

  async function uploadPending() {
    if (uploading.current) return;
    uploading.current = true;
    try {
      for (const part of await localParts(callId)) {
        if (part.blob.size > MAX_AUDIO_BYTES) throw new Error("A recording part exceeded 24 MB. Download your local audio before retrying.");
        const signed = await request({ action: "upload", seq: part.seq, offset: part.offset, duration: part.duration, mimeType: part.mimeType });
        const { error } = await createSupabaseBrowser()
          .storage.from(MODEL_BUCKET)
          .uploadToSignedUrl(signed.path, signed.token, part.blob, { contentType: part.mimeType });
        // An immutable existing object means the earlier upload completed before the connection dropped.
        if (error && !/already exists|duplicate/i.test(error.message)) throw error;
        await removeLocalPart(part.key);
        setPending((await localParts(callId)).length + unsaved.current.length);
      }
      await refresh();
    } finally {
      uploading.current = false;
    }
  }
  function releaseMic() {
    streams.current.forEach((s) => s.getTracks().forEach((t) => t.stop()));
    streams.current = [];
    void audioContext.current?.close();
    audioContext.current = null;
    setRecording(false);
    setPaused(false);
    setLevel(0);
  }
  async function start() {
    setError("");
    setBusy(true);
    try {
      await navigator.storage?.persist?.();
      const local = await localParts(callId);
      const existing = [...(data?.parts ?? []), ...local];
      if (existing.length) {
        sequence.current = Math.max(...existing.map((p) => p.seq)) + 1;
        offset.current = Math.max(...existing.map((p) => Number(p.offset) + Number(p.duration)));
      }
      if (sequence.current >= MAX_PARTS) throw new Error("Four-hour recording limit reached. Finish this call and start another.");
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      streams.current = [mic];
      const ctx = new AudioContext();
      audioContext.current = ctx;
      const destination = ctx.createMediaStreamDestination();
      ctx.createMediaStreamSource(mic).connect(destination);
      if (tabAudio) {
        const shared = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        streams.current.push(shared);
        if (!shared.getAudioTracks().length)
          throw new Error("No shared audio. Select a browser tab and enable Share tab audio, or use microphone / speakerphone mode.");
        ctx.createMediaStreamSource(new MediaStream(shared.getAudioTracks())).connect(destination);
      }
      const analyser = ctx.createAnalyser();
      ctx.createMediaStreamSource(destination.stream).connect(analyser);
      const samples = new Uint8Array(analyser.frequencyBinCount);
      const meter = () => {
        if (!keepRecording.current) return;
        analyser.getByteTimeDomainData(samples);
        setLevel(Math.min(100, Math.max(...samples.map((x) => Math.abs(x - 128))) * 4));
        requestAnimationFrame(meter);
      };
      const mimeType = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((t) => MediaRecorder.isTypeSupported(t));
      if (!mimeType) throw new Error("Recording is unsupported in this browser. Use Chrome, Edge, or Safari.");
      keepRecording.current = true;
      setRecording(true);
      streams.current.forEach((s) =>
        s.getTracks().forEach((t) => {
          t.onended = () => {
            if (keepRecording.current) {
              keepRecording.current = false;
              recorder.current?.stop();
              setError("Audio capture ended. Captured parts are preserved; finish processing or resume recording.");
            }
          };
        }),
      );
      const nextPart = () => {
        const r = new MediaRecorder(destination.stream, { mimeType, audioBitsPerSecond: 64000 });
        recorder.current = r;
        const blobs: Blob[] = [];
        const started = performance.now();
        let pausedAt: number | null = null;
        let pausedMs = 0;
        const durationMs = () => (pausedAt ?? performance.now()) - started - pausedMs;
        r.onpause = () => {
          pausedAt = performance.now();
        };
        r.onresume = () => {
          if (pausedAt !== null) pausedMs += performance.now() - pausedAt;
          pausedAt = null;
        };
        activeMs.current = 0;
        r.ondataavailable = (e) => {
          if (e.data.size) blobs.push(e.data);
        };
        const timer = setInterval(() => {
          activeMs.current = durationMs();
          setElapsed(offset.current + activeMs.current / 1000);
          if (activeMs.current >= PART_MS && r.state !== "inactive") r.stop();
        }, 250);
        r.onerror = () => {
          keepRecording.current = false;
          setError("Recording failed. Captured parts are preserved.");
          if (r.state !== "inactive") r.stop();
        };
        r.onstop = () => {
          clearInterval(timer);
          const duration = Math.max(0.01, durationMs() / 1000);
          const seq = sequence.current++;
          const part: LocalPart = {
            key: `${callId}:${seq}`,
            callId,
            seq,
            blob: new Blob(blobs, { type: mimeType }),
            mimeType,
            offset: offset.current,
            duration,
          };
          offset.current += duration;
          unsaved.current.push(part);
          setPending((n) => n + 1);
          // Save locally immediately, even when an earlier network upload is still pending.
          const localSave = saveLocalPart(part).then(() => {
            unsaved.current = unsaved.current.filter((p) => p.key !== part.key);
          });
          // Attach a rejection handler immediately; the upload queue may be waiting on the network.
          void localSave.catch(report);
          queue.current = queue.current
            .then(async () => {
              await localSave;
              await uploadPending();
            })
            .catch(report);
          if (keepRecording.current && sequence.current < MAX_PARTS) nextPart();
          else {
            keepRecording.current = false;
            releaseMic();
            stopDone.current?.();
            stopDone.current = null;
          }
        };
        r.start(1000);
      };
      nextPart();
      meter();
    } catch (e) {
      keepRecording.current = false;
      releaseMic();
      report(e);
    } finally {
      setBusy(false);
    }
  }
  async function process() {
    setBusy(true);
    setError("");
    try {
      if (recording) {
        keepRecording.current = false;
        await new Promise<void>((resolve) => {
          stopDone.current = resolve;
          recorder.current?.stop();
        });
      }
      await queue.current;
      for (const part of unsaved.current) await saveLocalPart(part);
      unsaved.current = [];
      await uploadPending();
      if ((await localParts(callId)).length) throw new Error("Audio is still waiting to upload. Retry when connected.");
      const state = await refresh();
      const count = state.call.expectedParts ?? state.parts.length;
      if (!count) throw new Error("Record some audio first.");
      while (!(await refresh()).parts.every((p) => p.summary)) {
        setProgress(state.parts.every((p) => p.segments !== null) ? "Preparing key points from your saved transcript…" : "Preparing your transcript…");
        const result = await request({ action: "process", expectedParts: count });
        setProgress(`Reviewed ${result.completed ?? count} of ${count} saved audio sections`);
        await refresh();
        if (result.done) break;
      }
      setProgress("Creating summary and cross-checking internal files…");
      await request({ action: "analyze" });
      await refresh();
    } catch (e) {
      report(e);
    } finally {
      setBusy(false);
      setProgress("");
      await refresh().catch(report);
    }
  }
  async function downloadLocal() {
    const all = [...(await localParts(callId)), ...unsaved.current];
    for (const p of all) {
      const url = URL.createObjectURL(p.blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `call-${callId}-part-${p.seq + 1}.${p.mimeType.includes("mp4") ? "mp4" : "webm"}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }
  if (!data) return <p role="status">{error || "Loading saved call…"}</p>;
  const segments = data.parts.flatMap((p) => p.segments ?? []);
  const transcriptReady = data.parts.length > 0 && data.parts.every((p) => p.segments !== null);
  const analysisFailed = data.call.error === ANALYSIS_ERROR || (data.call.status === "error" && data.parts.find((p) => !p.summary)?.segments != null);
  const analyzing = data.call.status === "analyzing";
  const stale = analyzing && now - new Date(data.call.updatedAt).getTime() > 360_000;
  return (
    <div className="space-y-4">
      {!configured && (
        <p className="rounded-lg border p-3 text-sm">
          Analysis is temporarily unavailable. Your audio can still be recorded and saved. Contact your workspace administrator.
        </p>
      )}
      <section className="space-y-4 rounded-lg border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">
              {recording
                ? paused
                  ? "Recording paused"
                  : "Recording live"
                : data.call.status === "ready"
                  ? "Call saved"
                  : (callStatusLabel[data.call.status] ?? "Call recording")}
            </h2>
            <p className="text-sm text-muted-foreground">
              {recording ? clock(elapsed) : clock(data.parts.reduce((total, part) => total + Number(part.duration), 0))} ·{" "}
              {pending ? `${pending} audio sections waiting to save` : data.parts.length ? "Audio saved securely" : "Ready when you are"}
            </p>
          </div>
          {recording && (
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-red-500" />
              <meter min={0} max={100} value={level} aria-label="Audio input level" />
            </div>
          )}
        </div>
        {data.call.status === "recording" && !recording && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={tabAudio} onChange={(e) => setTabAudio(e.target.checked)} disabled={busy} />
            Include browser tab audio with microphone
          </label>
        )}
        {data.call.status === "recording" && (
          <p className="text-xs text-muted-foreground">
            {tabAudio
              ? "Choose the call’s browser tab and enable Share tab audio."
              : "Microphone mode captures what your microphone hears. Use speakerphone for the other participants."}{" "}
            Audio is saved every two minutes; the current part is not yet saved. Keep this page open while recording. Up to four hours per call. Short gaps may
            occur at part boundaries.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {data.call.status === "recording" && !recording && (
            <Button onClick={start} disabled={busy}>
              <Mic />
              {data.parts.length ? "Resume recording" : "Start recording"}
            </Button>
          )}
          {recording && (
            <Button
              variant="outline"
              onClick={() => {
                if (paused) recorder.current?.resume();
                else recorder.current?.pause();
                setPaused(!paused);
              }}
            >
              {paused ? <Play /> : <Pause />}
              {paused ? "Resume" : "Pause"}
            </Button>
          )}
          {data.call.status !== "ready" && (
            <Button variant="outline" disabled={busy || (analyzing && !stale) || (!recording && !data.parts.length && !pending)} onClick={process}>
              <Square />
              {recording
                ? "Stop & analyze"
                : busy
                  ? "Working…"
                  : analyzing && !stale
                    ? "Analyzing…"
                    : transcriptReady || analysisFailed
                      ? "Retry analysis"
                      : data.call.status === "error"
                        ? "Retry transcription"
                        : "Analyze saved call"}
            </Button>
          )}
          {pending > 0 && (
            <Button variant="ghost" onClick={() => void downloadLocal().catch(report)}>
              Download pending audio
            </Button>
          )}
        </div>
        <p role="status" className="text-sm">
          {data.call.status === "ready"
            ? "Transcript and analysis saved. Continue in the chat below."
            : analyzing
              ? "Summary and internal-file cross-check are running. You can reopen this call later."
              : busy
                ? progress
                : data.call.status === "error"
                  ? ""
                  : transcriptReady
                    ? "Transcript saved. Your call is ready for analysis."
                    : ""}
        </p>
        {(error || data.call.error) && (
          <p role="alert" className="text-sm text-destructive">
            {error || (transcriptReady || analysisFailed ? ANALYSIS_ERROR : TRANSCRIPT_ERROR)}
          </p>
        )}
      </section>
      {children}
      {segments.length > 0 && (
        <section className="space-y-3 rounded-xl border bg-card p-5" aria-label="Call transcript">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Transcript · {segments.length} passages</h2>
            <input
              className="rounded border px-3 py-2 text-sm"
              aria-label="Search transcript"
              placeholder="Search transcript…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Searchable, timestamped evidence for this call and future team research. Speaker attribution is shown only when available.
          </p>
          <div className="max-h-96 space-y-3 overflow-y-auto rounded-lg border p-4">
            {segments
              .filter((s) => `${s.speaker ?? ""} ${s.text}`.toLowerCase().includes(filter.toLowerCase()))
              .map((s, i) => (
                <div key={i}>
                  <p className="text-xs font-medium text-muted-foreground">
                    {clock(s.start)}
                    {s.speaker ? ` · ${s.speaker}` : ""}
                  </p>
                  <p className="whitespace-pre-wrap text-sm">{s.text}</p>
                </div>
              ))}
          </div>
        </section>
      )}
    </div>
  );
}
