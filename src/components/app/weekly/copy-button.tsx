"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Copies one line or a whole section to the clipboard, the way the research board copies a citation. */
export function CopyButton({ text, label = "Copy", className, variant = "ghost", size = "sm" }: { text: string; label?: string; className?: string; variant?: "ghost" | "outline"; size?: "sm" | "default" }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard unavailable; nothing to undo */
    }
  };
  return (
    <Button type="button" size={size} variant={variant} className={cn("shrink-0", className)} onClick={copy} aria-label={copied ? "Copied" : label}>
      {copied ? "Copied" : label}
    </Button>
  );
}
