"use client";
import { createContext, useContext } from "react";
import type { TimelinePart } from "./timeline";

export type Marker = { t: number; label: string };

/** What the selected call's pane shares with the brief and the discussion rendered inside it. */
export type CallPane = {
  callId: string;
  parts: TimelinePart[];
  /** Seconds into the call where a brief point was said, or null. */
  timeOf: (point: { text: string; sourceIds: string[] }) => number | null;
  /** Open the Transcript tab at this moment. */
  openTranscriptAt: (seconds: number) => void;
  /** The brief registers its key-point times so the timeline can list them. */
  setMarkers: (markers: Marker[]) => void;
  /** True when this pane has a Discuss this call tab to send questions to. */
  canAsk: boolean;
  /** Open the Discuss this call tab; `asked` means a question was just handed to the chat to send. */
  openChat: (asked?: boolean) => void;
  /** Bumps each time a question is handed off, so a mounted chat reloads and sends it. */
  askSeq: number;
};

export const CallPaneContext = createContext<CallPane>({
  callId: "",
  parts: [],
  timeOf: () => null,
  openTranscriptAt: () => {},
  setMarkers: () => {},
  canAsk: false,
  openChat: () => {},
  askSeq: 0,
});

export const useCallPane = () => useContext(CallPaneContext);
