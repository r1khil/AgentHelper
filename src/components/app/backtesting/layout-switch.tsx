"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { History, Sparkles } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { setBacktestingLayout } from "@/lib/actions/preferences";
import { cn } from "@/lib/utils";

/**
 * Switches this member's Backtesting page between the redesign and the classic layout. The choice is saved on their
 * profile; the shell swaps its chrome on refresh. `href` (the synthetic preview) swaps with a link instead.
 */
export function LayoutSwitch({ to, href, className }: { to: "new" | "classic"; href?: string; className?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const content =
    to === "classic" ? (
      <>
        <History />
        Classic layout
      </>
    ) : (
      <>
        <Sparkles />
        Try the new layout
      </>
    );
  const cls = cn(to === "classic" && "text-ink-2", className);
  if (href)
    return (
      <Link data-tour="bt-layout" href={href} className={cn(buttonVariants({ variant: "outline", size: "sm" }), cls)}>
        {content}
      </Link>
    );
  return (
    <Button
      data-tour="bt-layout"
      type="button"
      variant="outline"
      size="sm"
      className={cls}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await setBacktestingLayout(to);
          if (r.ok) router.refresh();
        })
      }
    >
      {content}
    </Button>
  );
}
