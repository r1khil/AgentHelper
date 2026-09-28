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
        <li key={n.text} className="flex items-start gap-2 rounded-[10px] bg-caution/55 px-3 py-2 text-body leading-relaxed">
          <TriangleAlert className="mt-[3px] size-3.5 shrink-0 text-caution-foreground" aria-hidden />
          <span className="min-w-0">
            {n.text}{" "}
            {n.href && <Link href={n.href} className="font-medium text-caution-foreground underline underline-offset-2">{n.action ?? "Fix"}</Link>}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Warning pill for a toolbar: the notice count, opening the list with its Fix links. */
export function DataNoticesButton({ notices }: { notices: QualityNotice[] }) {
  if (!notices.length) return null;
  return (
    <Popover>
      <PopoverTrigger className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-caution px-3 text-body font-medium whitespace-nowrap text-caution-foreground transition-colors hover:bg-caution/80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
        <TriangleAlert className="size-3.5" aria-hidden />
        {notices.length} data {notices.length === 1 ? "notice" : "notices"}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(28rem,90vw)] rounded-[14px] p-2">
        <DataQualityNotices notices={notices} />
      </PopoverContent>
    </Popover>
  );
}
