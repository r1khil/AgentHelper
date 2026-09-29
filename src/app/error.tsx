"use client";

import { Button } from "@/components/ui/button";
import { OwlMark } from "@/components/app/owl-mark";

export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main className="grid min-h-screen place-items-center bg-background p-6">
      <div className="flex max-w-md flex-col items-start">
        <OwlMark className="size-10 rounded-full" />
        <span className="mt-4 text-caption font-semibold text-caution-foreground">Failed</span>
        <h1 className="mt-1 text-display font-bold tracking-[-0.02em]">Something went wrong</h1>
        <p className="mt-1 text-body text-ink-2">{error.message}</p>
        <Button className="mt-5" onClick={() => retry()}>
          Try again
        </Button>
      </div>
    </main>
  );
}
