"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Loader2, ScanEye } from "lucide-react";
import { setTransparencyMode } from "@/lib/actions/preferences";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Exec/admin transparency mode: the live trace of each lookup. The same preference as the account menu's switch. */
export function TraceToggle({ on }: { on: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="ghost"
      aria-pressed={on}
      disabled={pending}
      title={on ? "Transparency is on: each answer shows its live trace. Click to turn it off." : "Show the live trace of each lookup (transparency mode)."}
      onClick={() =>
        startTransition(async () => {
          await setTransparencyMode(!on);
          router.refresh();
        })
      }
      className={cn(on && "bg-secondary text-foreground")}
    >
      {pending ? <Loader2 className="animate-spin" /> : <ScanEye />}
      Trace
    </Button>
  );
}
