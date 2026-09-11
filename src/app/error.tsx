"use client";

import { useEffect } from "react";
import { AlertIcon } from "@/components/app/icons";

/**
 * Next 16 passes `retry`, not `reset` -- the prop was renamed and became
 * stable in 16.3.0. Verified in node_modules/next/dist/docs.
 */
export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto grid min-h-screen max-w-md place-items-center px-6">
      <div className="text-center">
        <AlertIcon className="text-quality-fail mx-auto mb-3 size-7" />
        <h1 className="mb-2 font-serif text-2xl">Something went wrong.</h1>
        <p className="text-muted-foreground mb-5 text-[13px]">
          The page could not be loaded. Nothing you had saved is affected.
        </p>
        <button
          onClick={retry}
          className="bg-primary text-primary-foreground hover:bg-primary-hover inline-flex h-9 items-center rounded-md px-4 text-[13px] font-semibold transition-colors"
        >
          Try again
        </button>
        {error.digest && (
          <p className="text-muted-foreground mt-4 font-mono text-[11px]">
            Reference {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
