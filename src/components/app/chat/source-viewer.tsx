"use client";

import { useEffect, useRef, useState } from "react";
import type { Source } from "@/lib/providers/types";
import { documentId, externalUrl, supportingRange } from "@/lib/agent/source-resolution";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

type Document = { title: string; text: string | null; url: string | null };

export function SourceViewer({ source, chatId, onClose }: { source: Source | null; chatId: string; onClose: () => void }) {
  return (
    <Dialog
      open={!!source}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-4xl">
        <DialogTitle>{source?.title || "Source document"}</DialogTitle>
        <DialogDescription>Source document and supporting passage</DialogDescription>
        {source && <DocumentBody key={source.id} source={source} chatId={chatId} />}
      </DialogContent>
    </Dialog>
  );
}

function DocumentBody({ source, chatId }: { source: Source; chatId: string }) {
  const [doc, setDoc] = useState<Document | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const mark = useRef<HTMLElement>(null);
  const id = documentId(source);
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    let retry: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const res = await fetch(`/api/sources/${encodeURIComponent(id!)}?chatId=${encodeURIComponent(chatId)}`, { signal: controller.signal, cache: "no-store" });
        if (!res.ok || !res.headers.get("content-type")?.includes("application/json")) throw new Error("Unavailable");
        if (res.status === 202) {
          if (!controller.signal.aborted) {
            setPending(true);
            retry = setTimeout(() => void load(), 2500);
          }
          return;
        }
        const document = (await res.json()) as Document;
        if (!controller.signal.aborted) setDoc(document);
      } catch {
        if (!controller.signal.aborted) setError("Source unavailable. The document may have been removed or access may have changed. Close the viewer and retry.");
      }
    }
    void load();
    return () => {
      controller.abort();
      clearTimeout(retry);
    };
  }, [id, chatId]);
  const text = doc?.text ?? "";
  const range = supportingRange(text, source.location?.text ?? source.excerpt);
  useEffect(() => {
    mark.current?.scrollIntoView({ block: "center" });
  }, [doc]);
  // Only the server's checked document URL is used as a fallback after loading.
  const original = externalUrl(doc?.url);
  if (!id || error)
    return (
      <p role="status" className="rounded border p-4">
        {error || "Source unavailable. No resolvable document or source URL was returned."}
      </p>
    );
  if (!doc) return <p role="status">{pending ? "Research is still running. This document will open when the answer is saved…" : "Loading source document…"}</p>;
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{doc.title}</span>
        {original && (
          <a className="underline" href={original} target="_blank" rel="noopener noreferrer">
            Open original document ↗
          </a>
        )}
      </div>
      {!text ? (
        <p role="status">Document text is unavailable.{original ? " Open the original document above." : " The original document is unavailable."}</p>
      ) : (
        <>
          {!range && (
            <p role="status" className="text-xs text-muted-foreground">
              {source.location?.text || source.excerpt
                ? "The supporting passage could not be located in the current document. Showing the full document."
                : "No passage location was saved. Showing the full document."}
            </p>
          )}
          <div className="max-h-[65vh] overflow-auto rounded border bg-background p-4">
            <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">
              {range ? (
                <>
                  {text.slice(0, range.start)}
                  <mark ref={mark} className="rounded bg-yellow-200 text-black">
                    {text.slice(range.start, range.end)}
                  </mark>
                  {text.slice(range.end)}
                </>
              ) : (
                text
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
