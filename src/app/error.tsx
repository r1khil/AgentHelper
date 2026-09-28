"use client";

import { Button } from "@/components/ui/button";

export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center p-6 text-center">
      <div>
        <div className="text-body font-medium">Something went wrong</div>
        <p className="mt-1 max-w-md text-body text-muted-foreground">{error.message}</p>
        <Button className="mt-4" variant="outline" onClick={() => retry()}>
          Try again
        </Button>
      </div>
    </main>
  );
}
