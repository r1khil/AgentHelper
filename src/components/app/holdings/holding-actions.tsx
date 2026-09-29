"use client";

import { useState } from "react";
import Link from "next/link";
import { Ellipsis, MessageSquareText, Upload } from "lucide-react";
import { exitHolding } from "@/lib/actions/holdings";
import { DocumentUploadForm } from "@/components/app/document-upload-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

/** The page header's secondary actions: Upload to Drive · Ask Hoot about T · ⋯ for the rest. The page adds its one primary (Record trade) after them. */
export function HoldingActions({
  ticker,
  holdingId,
  boardHref,
  canUpload,
  uploadDisabledReason,
  canExit,
  links,
}: {
  ticker: string;
  holdingId: string;
  boardHref: string;
  canUpload: boolean;
  uploadDisabledReason?: string;
  canExit: boolean;
  links: { label: string; href: string; external?: boolean }[];
}) {
  const [exitOpen, setExitOpen] = useState(false);
  return (
    <>
      {canUpload && (
        <Dialog>
          <DialogTrigger render={<Button variant="secondary" />}>
            <Upload className="size-3.5" />
            Upload to Drive
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Upload to the Fund&apos;s Drive</DialogTitle>
              <DialogDescription>A report, earnings update or model for {ticker}. Hoot can read it as soon as it&apos;s filed.</DialogDescription>
            </DialogHeader>
            <DocumentUploadForm holdingId={holdingId} disabledReason={uploadDisabledReason} />
          </DialogContent>
        </Dialog>
      )}
      <Button variant="secondary" nativeButton={false} render={<Link href={boardHref} />}>
        <MessageSquareText className="size-3.5" />
        Ask Hoot about {ticker}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="secondary" size="icon" aria-label="More actions" />}>
          <Ellipsis className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuGroup>
            {links.map((l) => (
              <DropdownMenuItem key={l.href} render={l.external ? <a href={l.href} target="_blank" rel="noreferrer" /> : <Link href={l.href} />}>
                {l.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
          {canExit && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => setExitOpen(true)}>
                Mark exited…
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {canExit && (
        <Dialog open={exitOpen} onOpenChange={setExitOpen}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Mark {ticker} exited?</DialogTitle>
              <DialogDescription>It moves off the team&apos;s holdings list. Its notes, documents and history stay.</DialogDescription>
            </DialogHeader>
            <form action={exitHolding} className="flex justify-end gap-2">
              <input type="hidden" name="holdingId" value={holdingId} />
              <Button type="button" variant="secondary" onClick={() => setExitOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Mark exited</Button>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
