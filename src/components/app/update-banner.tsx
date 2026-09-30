"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

const POLL_MS = 5 * 60 * 1000;

/** Shows once the server reports a different build than the one this page was loaded from. */
export function UpdateBanner({ buildId }: { buildId: string }) {
  const [stale, setStale] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    // The standalone synthetic mock works without a configured app session or any API polling.
    if (stale || pathname === "/portfolio-mock") return;
    let cancelled = false;

    async function check() {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) return;
        const data: { buildId?: string } = await res.json();
        if (!cancelled && data.buildId && data.buildId !== buildId) setStale(true);
      } catch {
        // Offline or mid-deploy: try again on the next tick.
      }
    }

    const interval = setInterval(check, POLL_MS);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, [buildId, stale, pathname]);

  if (!stale) return null;

  return (
    <div
      role="status"
      className="sticky top-0 z-50 flex items-center justify-center gap-3 border-b bg-primary px-4 py-2 text-body text-primary-foreground"
    >
      <span>Update available — please refresh to get the latest version.</span>
      <Button size="sm" variant="secondary" onClick={() => window.location.reload()}>
        <RefreshCw />
        Refresh
      </Button>
    </div>
  );
}
