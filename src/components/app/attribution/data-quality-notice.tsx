import Link from "next/link";
import { TriangleAlert } from "lucide-react";

export type QualityNotice = { text: string; href?: string; action?: string };

export function DataQualityNotices({ notices }: { notices: QualityNotice[] }) {
  if (!notices.length) return null;
  return (
    <ul className="mb-4 grid gap-1.5">
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
