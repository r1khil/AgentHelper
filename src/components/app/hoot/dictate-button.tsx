"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Mic } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { composerButtonSize } from "@/components/app/chat/styles";

// lib.dom types the events but not the recognizer itself (Chrome and Safari still ship it as webkitSpeechRecognition).
type Recognizer = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
export type RecognizerClass = new () => Recognizer;

function recognizerClass(): RecognizerClass | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognizerClass; webkitSpeechRecognition?: RecognizerClass };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const noSubscribe = () => () => {};

/** The box's text with what was said after it: one space between, the spoken pieces trimmed and joined. */
export function joinDictation(base: string, pieces: string[]) {
  const said = pieces.map((p) => p.trim()).filter(Boolean).join(" ");
  if (!said) return base;
  return base && !/\s$/.test(base) ? `${base} ${said}` : base + said;
}

const ERRORS: Record<string, string> = {
  "not-allowed": "Microphone access is blocked. Allow it in your browser's site settings to dictate.",
  "service-not-allowed": "This browser won't dictate here. Try Chrome, Edge or Safari.",
  "audio-capture": "No microphone found.",
  network: "Dictation couldn't reach the browser's speech service. Check your connection.",
  "no-speech": "Didn't hear anything, so dictation stopped. Press the mic to try again.",
};
const ENDED_ON_ITS_OWN = "Dictation stopped. Press the mic to keep going.";

export type DictationSession = {
  /** Stop listening; the last words still arrive and land in the box. */
  stop: () => void;
  /** Stop at once; nothing more is written. */
  abort: () => void;
  /** Whether the box's value is one dictation wrote (and not an older one it has since written past). */
  owns: (value: string) => boolean;
};

/**
 * One dictation run, apart from React so it can be tested with a fake recognizer. Finished phrases are kept by their
 * result index (a browser that re-sends one, as Safari can in continuous mode, overwrites rather than repeats it) and
 * the phrase still being heard follows them. `notify` gets a plain sentence when the run fails or ends by itself.
 */
export function startDictation(
  Rec: RecognizerClass,
  { base, lang, write, onEnd, notify }: { base: string; lang: string; write: (v: string) => void; onEnd: () => void; notify: (msg: string, tone: "error" | "info") => void },
): DictationSession {
  const r = new Rec();
  r.lang = lang;
  r.continuous = true;
  r.interimResults = true;
  // Everything written, oldest first: a render can lag a write or two behind, so any of these is still ours.
  const writes = [base];
  const finals: string[] = [];
  let ended = false;
  let errored = false;
  r.onresult = (e) => {
    const heard: string[] = [];
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i];
      const said = res[0]?.transcript ?? "";
      if (res.isFinal) finals[i] = said;
      else heard.push(said);
    }
    const next = joinDictation(base, [...Array.from(finals, (p) => p ?? ""), ...heard]);
    writes.push(next);
    write(next);
  };
  r.onerror = (e) => {
    const msg = ERRORS[e.error];
    if (!msg) return;
    errored = true;
    notify(msg, "error");
  };
  r.onend = () => {
    if (!ended && !errored) notify(ENDED_ON_ITS_OWN, "info");
    ended = true;
    onEnd();
  };
  r.start();
  return {
    stop: () => {
      ended = true;
      r.stop();
    },
    abort: () => {
      // Late results must not overwrite what the member typed or sent.
      r.onresult = null;
      ended = true;
      r.abort();
    },
    owns: (value) => {
      const i = writes.lastIndexOf(value);
      if (i < 0) return false;
      writes.splice(0, i); // The box has shown this one: the older writes are no longer ours.
      return true;
    },
  };
}

/**
 * The mic beside a Hoot box's send button: the browser's own speech recognition (Chrome, Edge, Safari; hidden where
 * there is none, as in Firefox), so it costs nothing and the words land in the box as they're said, after whatever was
 * already typed. The mic again stops it; typing, sending or clearing the box ends it too (the box no longer holds what
 * dictation last wrote). Pressing it keeps the cursor in the box, so Enter still sends.
 */
export function DictateButton({
  value,
  onChange,
  disabled,
  size = "lg",
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  /** Matches the send button beside it: a 36px circle, 34px or 30px. */
  size?: "round" | "lg" | "sm";
  className?: string;
}) {
  const supported = useSyncExternalStore(noSubscribe, () => !!recognizerClass(), () => false);
  const [listening, setListening] = useState(false);
  const session = useRef<DictationSession | null>(null);
  const change = useRef(onChange);
  useEffect(() => {
    change.current = onChange;
  });

  const abort = () => {
    session.current?.abort();
    session.current = null;
    setListening(false);
  };

  // The box moved on without us (typed in, sent, cleared, filled from elsewhere) or went disabled: drop dictation.
  useEffect(() => {
    if (session.current && (disabled || !session.current.owns(value))) abort();
  }, [value, disabled]);

  useEffect(() => abort, []);

  if (!supported) return null;

  const start = () => {
    const Rec = recognizerClass();
    if (!Rec || disabled) return;
    try {
      const s: DictationSession = startDictation(Rec, {
        base: value,
        lang: navigator.language || "en-US",
        write: (v) => change.current(v),
        onEnd: () => {
          if (session.current === s) session.current = null;
          setListening(false);
        },
        notify: (msg, tone) => (tone === "error" ? toast.error(msg) : toast(msg)),
      });
      session.current = s;
      setListening(true);
    } catch {
      toast.error("Couldn't start dictation. Try again in a moment.");
    }
  };

  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={listening}
      aria-label={listening ? "Stop dictating" : "Dictate"}
      title={listening ? "Listening… press to stop" : "Dictate your question"}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => (listening ? session.current?.stop() : start())}
      className={cn(
        "relative grid shrink-0 place-items-center text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-40 disabled:hover:bg-transparent",
        composerButtonSize(size),
        listening && "bg-secondary text-foreground",
        className,
      )}
    >
      <Mic className={size === "sm" ? "size-3.5" : "size-4"} strokeWidth={2} aria-hidden />
      {listening && <span className="absolute top-1 right-1 size-1.5 animate-pulse rounded-full bg-foreground" aria-hidden />}
    </button>
  );
}
