"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { MessageSquareText, Mic, Pause, Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/app/panel";
import { Tabs } from "@/components/app/tabs";
import { cn } from "@/lib/utils";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { MODEL_BUCKET } from "@/lib/models/upload";
import { localParts, removeLocalPart, saveLocalPart, type LocalPart } from "@/lib/sell-side/local-audio";
import { ANALYSIS_ERROR, TRANSCRIPT_ERROR, callStatusLabel } from "@/lib/sell-side/status";
import { clock, MAX_AUDIO_BYTES, MAX_PARTS, PART_MS, type Segment } from "@/lib/sell-side/types";
import { CallPaneContext, type CallPane, type Marker } from "./pane-context";
import { callLength, minutesLabel, pointTime, stamp, waveform } from "./timeline";

type State = {
  call: { status: string; error: string | null; expectedParts: number | null; updatedAt: string };
  parts: { seq: number; offset: string; duration: string; segments: Segment[] | null; summary: string | null }[];
};
type Tab = "brief" | "transcript" | "chat";
const NO_PARTS: State["parts"] = [];

/**
 * The selected call: title, the call timeline, recording and processing controls while the call is in progress,
 * then Brief / Transcript / Saved chat tabs. `children` is the brief (or why it is hidden); `chat` is the discussion.
 */
export function CallWorkspace({
  callId,
  configured,
  children,
  header,
  chat,
  expect,
}: {
  callId: string;
  configured: boolean;
  children?: ReactNode;
  /** Title row: ticker, title, and the meta around the call length ("Maya Chen · Thursday, September 24" … "Technology"). */
  header?: { ticker: string; title: string; byline: string; sector?: string };
  /** The call's saved discussion; mounted the first time the Saved chat tab opens. */
  chat?: ReactNode;
  /**
   * What the page knows the call will show once its saved state loads: the timeline (it has transcribed speech) and
   * the recording and processing card (it isn't ready yet). The loading line holds their place so the tabs don't move.
   */
  expect?: { timeline: boolean; recorder: boolean };
}) {
  const router = useRouter();
  const [chosenTab, setChosenTab] = useState<Tab | null>(null);
  const [chatOpened, setChatOpened] = useState(false);
  const [askSeq, setAskSeq] = useState(0);
  const [markers, setMarkersState] = useState<Marker[]>([]);
  const [highlight, setHighlight] = useState<{ index: number; n: number } | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
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
  const parts = data?.parts ?? NO_PARTS;
  const segments = useMemo(() => parts.flatMap((p) => p.segments ?? []), [parts]);
  const total = useMemo(() => Math.max(callLength(parts), segments.at(-1)?.end ?? 0), [parts, segments]);
  const bars = useMemo(() => waveform(segments, total), [segments, total]);
  const openTranscriptAt = useCallback(
    (t: number) => {
      let index = 0;
      segments.forEach((s, i) => {
        if (s.start <= t + 0.5) index = i;
      });
      setFilter("");
      setChosenTab("transcript");
      setHighlight({ index, n: Date.now() });
    },
    [segments],
  );
  const openChat = useCallback((asked?: boolean) => {
    setChatOpened(true);
    setChosenTab("chat");
    if (asked) setAskSeq((n) => n + 1);
  }, []);
  const setMarkers = useCallback((next: Marker[]) => setMarkersState((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next)), []);
  const canAsk = Boolean(chat);
  const pane = useMemo<CallPane>(
    () => ({ callId, parts, timeOf: (p) => pointTime(p, parts, callId), openTranscriptAt, setMarkers, canAsk, openChat, askSeq }),
    [callId, parts, openTranscriptAt, setMarkers, canAsk, openChat, askSeq],
  );
  // Scroll the transcript to the moment a timestamp or timeline marker pointed at, and let the row glow briefly.
  useEffect(() => {
    if (!highlight) return;
    transcriptRef.current?.querySelector(`[data-seg="${highlight.index}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    const t = setTimeout(() => setHighlight(null), 2400);
    return () => clearTimeout(t);
  }, [highlight]);

  const status = data?.call.status;
  const transcriptReady = parts.length > 0 && parts.every((p) => p.segments !== null);
  const analysisFailed = !!data && (data.call.error === ANALYSIS_ERROR || (status === "error" && parts.find((p) => !p.summary)?.segments != null));
  const analyzing = status === "analyzing";
  const stale = !!data && analyzing && now - new Date(data.call.updatedAt).getTime() > 360_000;
  const showRecorder = !!data && (status !== "ready" || recording || pending > 0 || !!error || !!data.call.error);
  const expected = data?.call.expectedParts ?? parts.length;
  const progressDone = status === "summarizing" ? parts.filter((p) => p.summary).length : parts.filter((p) => p.segments !== null).length;
  const showProgress = (status === "transcribing" || status === "summarizing") && expected > 0;
  const autoTab: Tab = children ? "brief" : segments.length ? "transcript" : "brief";
  const tab: Tab = chosenTab === "chat" && !chat ? autoTab : (chosenTab ?? autoTab);
  const meta = header ? [header.byline, total > 0 ? minutesLabel(total) : null, header.sector].filter(Boolean).join(" · ") : "";
  const filtered = segments.map((s, i) => ({ s, i })).filter(({ s }) => `${s.speaker ?? ""} ${s.text}`.toLowerCase().includes(filter.toLowerCase()));
  const tabs: { key: Tab; label: string }[] = [
    { key: "brief", label: "Brief" },
    { key: "transcript", label: "Transcript" },
    ...(chat ? [{ key: "chat" as const, label: "Saved chat" }] : []),
  ];
  const briefNote =
    status === "recording"
      ? "The brief appears here once the call is recorded and analyzed."
      : status === "error"
        ? "The brief appears here once the retry above finishes."
        : "The brief appears here when the transcript and the file check finish. You can leave this page and come back.";

  return (
    <CallPaneContext.Provider value={pane}>
      <Panel className="min-h-0 flex-1">
        <div className="shrink-0 px-5 pt-4">
          {header && (
            <div className="flex flex-wrap items-start gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="text-title leading-tight font-semibold tracking-[-0.015em]">
                  <span className="font-mono">{header.ticker}</span> · {header.title}
                </h2>
                <p className="mt-1 text-body text-muted-foreground">{meta}</p>
              </div>
              {chat && (
                <Button variant="outline" onClick={() => openChat()}>
                  <MessageSquareText />
                  Ask Hoot about this call
                </Button>
              )}
            </div>
          )}
          {!configured && (
            <p className="mt-3 rounded-[10px] bg-caution px-3 py-2 text-body text-caution-foreground">
              Analysis is temporarily unavailable. Your audio can still be recorded and saved. Contact your workspace administrator.
            </p>
          )}
          {bars.length > 0 && <Timeline bars={bars} markers={markers} total={total} onJump={openTranscriptAt} />}
          {!data ? (
            error ? (
              <p role="status" className="mt-3.5 text-body text-muted-foreground">
                {error}
              </p>
            ) : (
              <LoadingCall timeline={!!expect?.timeline} recorder={!!expect?.recorder} />
            )
          ) : (
            showRecorder && (
              <section aria-label="Recording and processing" className="mt-3.5 space-y-3 rounded-[10px] bg-band px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-emph font-semibold">
                      {recording
                        ? paused
                          ? "Recording paused"
                          : "Recording live"
                        : data.call.status === "ready"
                          ? "Call saved"
                          : (callStatusLabel[data.call.status] ?? "Call recording")}
                    </h3>
                    <p className="text-body text-muted-foreground">
                      <span className="font-mono">{recording ? clock(elapsed) : clock(callLength(parts))}</span> ·{" "}
                      {pending ? `${pending} audio sections waiting to save` : parts.length ? "Audio saved securely" : "Ready when you are"}
                    </p>
                  </div>
                  {recording && (
                    <div className="flex items-center gap-2">
                      <span className={cn("size-2 rounded-full bg-down", !paused && "animate-pulse")} />
                      <meter min={0} max={100} value={level} aria-label="Audio input level" />
                    </div>
                  )}
                  {showProgress && (
                    <div className="flex w-48 items-center gap-2" title={`${progressDone} of ${expected} saved audio sections`}>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-caution-foreground" style={{ width: `${Math.round((progressDone / expected) * 100)}%` }} />
                      </div>
                      <span className="font-mono text-body text-caution-foreground">{Math.round((progressDone / expected) * 100)}%</span>
                    </div>
                  )}
                </div>
                {data.call.status === "recording" && !recording && (
                  <label className="flex items-center gap-2 text-body">
                    <input type="checkbox" checked={tabAudio} onChange={(e) => setTabAudio(e.target.checked)} disabled={busy} />
                    Include browser tab audio with microphone
                  </label>
                )}
                {data.call.status === "recording" && (
                  <p className="text-body leading-relaxed text-muted-foreground">
                    {tabAudio
                      ? "Choose the call’s browser tab and enable Share tab audio."
                      : "Microphone mode captures what your microphone hears. Use speakerphone for the other participants."}{" "}
                    Audio is saved every two minutes; the current part is not yet saved. Keep this page open while recording. Up to four hours per call. Short
                    gaps may occur at part boundaries.
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
                <p role="status" className="text-body empty:hidden">
                  {data.call.status === "ready"
                    ? "Transcript and analysis saved. The brief, transcript and saved chat are in the tabs below."
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
                  <p role="alert" className="text-body text-down">
                    {error || (transcriptReady || analysisFailed ? ANALYSIS_ERROR : TRANSCRIPT_ERROR)}
                  </p>
                )}
              </section>
            )
          )}
          <Tabs
            label="Call views"
            idBase={callId}
            className="mt-3.5"
            onSelect={(k) => (k === "chat" ? openChat() : setChosenTab(k as Tab))}
            items={tabs.map((t) => ({ ...t, active: tab === t.key }))}
          />
        </div>
        <div
          role="tabpanel"
          id={`${callId}-panel-brief`}
          aria-labelledby={`${callId}-tab-brief`}
          className={cn(tab === "brief" ? "flex" : "hidden", "min-h-0 flex-1 flex-col")}
        >
          {children || <p className="px-5 py-4 text-body text-muted-foreground">{briefNote}</p>}
        </div>
        <div
          role="tabpanel"
          id={`${callId}-panel-transcript`}
          aria-labelledby={`${callId}-tab-transcript`}
          className={cn(tab === "transcript" ? "block" : "hidden", "min-h-0 flex-1 overflow-y-auto")}
        >
          {segments.length > 0 ? (
            <section className="px-5 py-3.5" aria-label="Call transcript">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-emph font-semibold">
                  Transcript · <span className="font-mono">{segments.length}</span> passages
                </h3>
                <input
                  className="h-8 w-64 max-w-full rounded-lg border bg-card px-3 text-body outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
                  aria-label="Search transcript"
                  placeholder="Search transcript…"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
              </div>
              <p className="mt-1 text-caption text-muted-foreground">
                Searchable, timestamped evidence for this call and future team research. Speaker attribution is shown only when available.
              </p>
              <div ref={transcriptRef} className="mt-2">
                {filtered.map(({ s, i }) => (
                  <div
                    key={i}
                    data-seg={i}
                    className={cn(
                      "grid grid-cols-[64px_minmax(0,1fr)] gap-3 rounded-[6px] border-b border-row py-2.5 transition-colors duration-500",
                      highlight?.index === i && "bg-band",
                    )}
                  >
                    <span className="pt-0.5 font-mono text-body font-medium text-series-1">{stamp(s.start)}</span>
                    <div className="min-w-0">
                      {s.speaker && <p className="text-body font-medium text-muted-foreground">{s.speaker}</p>}
                      <p className="text-body leading-relaxed whitespace-pre-wrap">{s.text}</p>
                    </div>
                  </div>
                ))}
                {!filtered.length && <p className="py-3 text-body text-muted-foreground">No passage matches “{filter}”.</p>}
              </div>
            </section>
          ) : (
            <p className="px-5 py-4 text-body text-muted-foreground">The transcript appears here once the audio is transcribed.</p>
          )}
        </div>
        {chat && chatOpened && (
          <div
            role="tabpanel"
            id={`${callId}-panel-chat`}
            aria-labelledby={`${callId}-tab-chat`}
            className={cn(tab === "chat" ? "block" : "hidden", "min-h-0 flex-1 overflow-y-auto px-5 py-4")}
          >
            {chat}
          </div>
        )}
      </Panel>
    </CallPaneContext.Provider>
  );
}

/**
 * "Loading saved call…" in the space the loaded call will fill: the timeline's band (same size, so the timeline
 * replaces it without a shift), the top of the recording card, or, when neither will show, nothing visible at all.
 */
function LoadingCall({ timeline, recorder }: { timeline: boolean; recorder: boolean }) {
  const status = (
    <p role="status" className={cn("text-body text-muted-foreground", !timeline && !recorder && "sr-only")}>
      Loading saved call…
    </p>
  );
  return (
    <>
      {timeline && <div className="mt-3.5 flex h-9 items-center rounded-[10px] bg-band px-3">{!recorder && status}</div>}
      {recorder ? <div className="mt-3.5 rounded-[10px] bg-band px-4 py-3">{status}</div> : !timeline && status}
    </>
  );
}

/** The call timeline: speech-density bars from the transcript timing, with a blue marker at each key point. */
function Timeline({ bars, markers, total, onJump }: { bars: number[]; markers: Marker[]; total: number; onJump: (seconds: number) => void }) {
  const at = (t: number) => `calc(10px + (100% - 20px) * ${Math.min(1, Math.max(0, t / total))})`;
  return (
    <div role="group" aria-label="Call timeline" className="relative mt-3.5 h-9 overflow-hidden rounded-[10px] bg-band">
      <button
        type="button"
        aria-label="Open the transcript at this point in the call"
        className="absolute inset-x-2.5 inset-y-2 flex cursor-pointer items-center gap-[2px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          onJump(((e.clientX - r.left) / Math.max(1, r.width)) * total);
        }}
      >
        {bars.map((h, i) => (
          <span key={i} className="min-w-px flex-1 rounded-[1px] bg-series-neutral/60" style={{ height: `${Math.round(h * 100)}%` }} />
        ))}
      </button>
      {markers.map((m, i) => (
        <button
          key={i}
          type="button"
          title={`${stamp(m.t)} · ${m.label}`}
          aria-label={`Key point at ${stamp(m.t)}: ${m.label}`}
          onClick={() => onJump(m.t)}
          className="group absolute inset-y-0 w-3 -translate-x-1/2 outline-none"
          style={{ left: at(m.t) }}
        >
          <span className="absolute inset-y-1 left-1/2 w-0.5 -translate-x-1/2 rounded-[1px] bg-series-1 group-hover:w-[3px] group-focus-visible:w-[3px]" />
        </button>
      ))}
    </div>
  );
}
