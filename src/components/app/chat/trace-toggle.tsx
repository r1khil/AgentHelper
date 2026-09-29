"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Loader2, ScanEye } from "lucide-react";
import { setTransparencyMode } from "@/lib/actions/preferences";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Exec/admin transparency mode: the live trace of each lookup. The same preference as the account menu's switch. The
 * trace streams while an answer is written and isn't saved, so switching it on changes nothing on answers already here:
 * the toast says where it will show.
 */
export function TraceToggle({ on }: { on: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="ghost"
      aria-pressed={on}
      disabled={pending}
      title={on ? "Live trace is on: new answers show each step as it runs. Click to turn it off." : "Show each step and provider call of the next answers as they run. Past answers aren't traced."}
      onClick={() =>
        startTransition(async () => {
          await setTransparencyMode(!on);
          router.refresh();
          toast(on ? "Live trace off." : "Live trace on. The next answer shows each step and provider call under Steps as Hoot works.");
        })
      }
      className={cn(on && "bg-secondary text-foreground")}
    >
      {pending ? <Loader2 className="animate-spin" /> : <ScanEye />}
      Trace
    </Button>
  );
}
