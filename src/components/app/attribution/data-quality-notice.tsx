"use client";

import Link from "next/link";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type QualityNotice = { text: string; href?: string; action?: string; word?: "Stale" | "Missing" | "Check" | "Partial" };

/** The status word a notice leads with, so it is never only a colour: what is stale, what is missing, or just "check". */
export function noticeWord(n: QualityNotice): NonNullable<QualityNotice["word"]> {
  if (n.word) return n.word;
  if (/\bstale\b|days old|older than/i.test(n.text)) return "Stale";
  if (/\bmissing\b|no s&p|no price|no sector|not been stored|cannot be calculated|unavailable|no benchmark|needs at least/i.test(n.text)) return "Missing";
  if (/partial|fewer|leaves it out|left out/i.test(n.text)) return "Partial";
  return "Check";
}

/** One notice: its amber word, the words, and the place to fix it. */
export function NoticeLine({ notice }: { notice: QualityNotice }) {
  return (
    <p role="note" className="text-body">
      <b className="font-semibold text-caution-foreground">{noticeWord(notice)}</b> <span className="text-ink-3">{notice.text}</span>
      {notice.href && (
        <>
          {" "}
          <Link href={notice.href} className="font-semibold text-foreground underline underline-offset-2">
            {notice.action ?? "Fix"}
          </Link>
        </>
      )}
    </p>
  );
}

export function DataQualityNotices({ notices }: { notices: QualityNotice[] }) {
  if (!notices.length) return null;
  return (
    <ul className="grid gap-2.5">
      {notices.map((n) => (
        <li key={n.text}>
          <NoticeLine notice={n} />
        </li>
      ))}
    </ul>
  );
}

/** The count of notices as an amber word that opens the list with its fix links. */
export function DataNoticesButton({ notices, label }: { notices: QualityNotice[]; label?: string }) {
  if (!notices.length) return null;
  return (
    <Popover>
      <PopoverTrigger className="inline-flex h-7 shrink-0 items-center rounded-lg px-1.5 text-body font-semibold whitespace-nowrap text-caution-foreground underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        {label ?? `${notices.length} data ${notices.length === 1 ? "notice" : "notices"}`}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(28rem,90vw)] p-3">
        <DataQualityNotices notices={notices} />
      </PopoverContent>
    </Popover>
  );
}

/**
 * The note at the right of a page's big number: the first data notice in full, the rest behind "N more". Nothing here
 * when the data is sound.
 */
export function HeroNotes({ notices }: { notices: QualityNotice[] }) {
  if (!notices.length) return null;
  const [first, ...rest] = notices;
  return (
    <div className="mb-1 flex max-w-[360px] shrink-0 flex-col items-start gap-1.5">
      <NoticeLine notice={first} />
      {rest.length > 0 && <DataNoticesButton notices={rest} label={`${rest.length} more ${rest.length === 1 ? "notice" : "notices"}`} />}
    </div>
  );
}
