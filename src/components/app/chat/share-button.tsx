"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** "Share": copies this page's address. A thread opens for the teammates who can open the team's chats, so the link is all it takes. */
export function ShareButton() {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="secondary"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(window.location.href);
          setCopied(true);
          toast.success("Link copied. It opens for anyone who may open this conversation.");
          setTimeout(() => setCopied(false), 1600);
        } catch {
          toast.error("Couldn't copy the link. Copy it from the address bar.");
        }
      }}
    >
      {copied ? "Link copied" : "Share"}
    </Button>
  );
}
