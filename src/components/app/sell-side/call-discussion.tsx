"use client";
import { useState, type ComponentProps } from "react";
import { ChatPanel } from "@/components/app/chat/chat-panel";
import { Button } from "@/components/ui/button";

/** Keep the brief in view on completion; mount the existing chat when the analyst opens it. */
export function CallDiscussion(props: ComponentProps<typeof ChatPanel>) {
  const [open, setOpen] = useState(false);
  return (
    <section aria-label="Discuss this call" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-5">
        <div>
          <h2 className="font-semibold">Discuss this call</h2>
          <p className="mt-1 text-sm text-muted-foreground">Ask follow-up questions using the transcript and saved evidence.</p>
        </div>
        <Button variant="outline" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? "Close call chat" : "Open call chat"}
        </Button>
      </div>
      {open && <ChatPanel {...props} />}
    </section>
  );
}
