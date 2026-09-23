"use client";

import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type QualityNotice = { text: string; href?: string; action?: string };

export function DataQualityNotices({ notices }: { notices: QualityNotice[] }) {
  if (!notices.length) return null;
  return (
    <ul className="grid gap-1.5">
      {notices.map((n) => (
        <li key={n.text} className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning-foreground" aria-hidden />
          <span className="min-w-0">
            {n.text}{" "}
            {n.href && <Link href={n.href} className="font-medium underline underline-offset-2">{n.action ?? "Fix"}</Link>}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Header pill: the notice count, expanding to the list with its Fix links. */
export function DataNoticesButton({ notices }: { notices: QualityNotice[] }) {
  if (!notices.length) return null;
  return (
    <Popover>
      <PopoverTrigger className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-warning/40 bg-warning/10 px-2.5 text-[0.8rem] font-medium text-warning-foreground hover:bg-warning/20 focus-visible:outline-2 focus-visible:outline-ring">
        <TriangleAlert className="size-3.5" aria-hidden />
        {notices.length} data {notices.length === 1 ? "notice" : "notices"}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(28rem,90vw)] p-2">
        <DataQualityNotices notices={notices} />
      </PopoverContent>
    </Popover>
  );
}
