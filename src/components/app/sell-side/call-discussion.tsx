"use client";
import { useEffect, useRef, useState, type ComponentProps } from "react";
import type { UIMessage } from "ai";
import { ChatPanel } from "@/components/app/chat/chat-panel";
import type { RunStatus } from "@/lib/chats";
import { Button } from "@/components/ui/button";
import { useCallPane } from "./pane-context";

type Props = ComponentProps<typeof ChatPanel>;

/**
 * The call's saved discussion. Standalone it keeps the brief in view and mounts the chat when the analyst opens it;
 * `embedded` renders it straight into the call's Discuss this call tab (which only mounts it once opened).
 */
export function CallDiscussion({ embedded = false, ...props }: Props & { embedded?: boolean }) {
  const [open, setOpen] = useState(false);
  if (embedded) return <EmbeddedDiscussion {...props} />;
  return (
    <section aria-label="Discuss this call" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 border-y py-3">
        <div>
          <h2 className="text-title font-bold tracking-[-0.01em]">Discuss this call</h2>
          <p className="mt-1 text-body text-muted-foreground">Ask follow-up questions using the transcript and saved evidence.</p>
        </div>
        <Button variant="outline" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? "Close call chat" : "Open call chat"}
        </Button>
      </div>
      {open && <ChatPanel {...props} />}
    </section>
  );
}

/**
 * The chat sends a handed-off question when it mounts. When a "Questions Hoot would ask next" chip is clicked
 * after the chat is already open, reload the saved thread and remount so the new question goes out on top of it.
 */
function EmbeddedDiscussion(props: Props) {
  const { askSeq } = useCallPane();
  const seen = useRef(askSeq);
  const [mount, setMount] = useState<{ key: number; messages: UIMessage[]; runStatus: RunStatus }>({
    key: 0,
    messages: props.initialMessages,
    runStatus: props.initialRunStatus,
  });
  useEffect(() => {
    if (askSeq === seen.current) return;
    seen.current = askSeq;
    let live = true;
    const reload = async () => {
      try {
        const res = await fetch(`/api/chat/${props.chatId}`, { cache: "no-store" });
        const data = res.ok ? ((await res.json()) as { runStatus: RunStatus; messages: UIMessage[] }) : null;
        if (live) setMount((m) => ({ key: m.key + 1, messages: data?.messages ?? m.messages, runStatus: data?.runStatus ?? m.runStatus }));
      } catch {
        if (live) setMount((m) => ({ ...m, key: m.key + 1 }));
      }
    };
    void reload();
    return () => {
      live = false;
    };
  }, [askSeq, props.chatId]);
  return (
    <section aria-label="Discuss this call">
      <p className="mb-3 text-body text-muted-foreground">Ask follow-up questions using the transcript and saved evidence.</p>
      <ChatPanel key={mount.key} {...props} initialMessages={mount.messages} initialRunStatus={mount.runStatus} />
    </section>
  );
}
