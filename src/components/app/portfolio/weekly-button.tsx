"use client";

import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { useShell } from "@/components/app/shell/shell-context";
import { cn } from "@/lib/utils";

/**
 * "Weekly update", the Portfolio header's way to the Sunday pack (execs and admins), with the newest pack's status
 * beside it until it is sent: "Draft", "Scheduled", or "Failed" in amber.
 */
export function WeeklyButton() {
  const status = useShell()?.counts.weekly?.value;
  return (
    <Link href="/weekly" className={cn(buttonVariants({ variant: "secondary" }), "gap-2")}>
      Weekly update
      {status && <span className={cn("text-caption font-semibold", status === "Failed" ? "text-caution-foreground" : "text-muted-foreground")}>{status}</span>}
    </Link>
  );
}
