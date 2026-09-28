"use client";

import { useEffect, useRef } from "react";

/**
 * Admin's collapsed Diagnostics: models, search index, job runs and other plumbing. Closed by default; opens itself
 * when the URL points at something inside it (e.g. /admin#agent from a Connections link).
 */
export function Diagnostics({ summary, children }: { summary: React.ReactNode; children: React.ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const reveal = () => {
      const target = window.location.hash ? document.getElementById(decodeURIComponent(window.location.hash.slice(1))) : null;
      if (!target || !ref.current?.contains(target)) return;
      ref.current.open = true;
      target.scrollIntoView();
    };
    reveal();
    window.addEventListener("hashchange", reveal);
    return () => window.removeEventListener("hashchange", reveal);
  }, []);

  return (
    <details ref={ref} id="diagnostics" className="group scroll-mt-20 rounded-[14px] bg-band-2 shadow-[0_0_0_1px_var(--border)]">
      <summary className="flex cursor-pointer list-none items-baseline gap-3 px-4 py-3 select-none hover:text-foreground [&::-webkit-details-marker]:hidden">
        <h2 className="text-[14.5px] font-semibold">
          <span className="mr-1.5 inline-block text-muted-foreground transition-transform group-open:rotate-90">›</span>
          Diagnostics
        </h2>
        <span className="min-w-0 truncate text-[12.5px] text-muted-foreground">{summary}</span>
      </summary>
      <div className="grid gap-6 border-t border-row p-4">{children}</div>
    </details>
  );
}
