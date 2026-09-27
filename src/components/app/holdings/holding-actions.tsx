"use client";

import { useState } from "react";
import Link from "next/link";
import { Ellipsis, MessageSquareText, Upload } from "lucide-react";
import { exitHolding, updateOwner } from "@/lib/actions/holdings";
import { DocumentUploadForm } from "@/components/app/document-upload-form";
import { NativeSelect } from "@/components/app/native-select";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export type OwnerChoice = {
  holdingId: string;
  ticker: string;
  ownerId: string | null;
  members: { id: string; fullName: string }[];
  /** Members who can't manage the team may only take an unowned holding or keep their own. */
  locked: boolean;
};

/** Pick the holding's owner. Opened from the at-a-glance "Change" link or the ⋯ menu. */
export function OwnerDialog({ choice, open, onOpenChange, trigger }: { choice: OwnerChoice; open?: boolean; onOpenChange?: (open: boolean) => void; trigger?: React.ReactElement }) {
  const [own, setOwn] = useState(false);
  const isOpen = open ?? own;
  const setOpen = onOpenChange ?? setOwn;
  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      {trigger && <DialogTrigger render={trigger} />}
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Owner of {choice.ticker}</DialogTitle>
          <DialogDescription>The owner writes the movement updates and earnings expectations. With no owner, movement alerts fall back to the lead analyst.</DialogDescription>
        </DialogHeader>
        <form
          action={async (fd) => {
            await updateOwner(fd);
            setOpen(false);
          }}
          className="flex items-center gap-2"
        >
          <input type="hidden" name="holdingId" value={choice.holdingId} />
          <NativeSelect name="ownerId" defaultValue={choice.ownerId ?? ""} disabled={choice.locked} className="min-w-0 flex-1" aria-label="Owner">
            <option value="">Unassigned</option>
            {choice.members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.fullName}
              </option>
            ))}
          </NativeSelect>
          <Button type="submit" disabled={choice.locked}>
            Save
          </Button>
        </form>
        {choice.locked && <p className="text-xs text-muted-foreground">Only the team&apos;s lead analyst or an exec can reassign a holding someone else owns.</p>}
      </DialogContent>
    </Dialog>
  );
}

/** "Change" in the at-a-glance list. */
export function OwnerChangeLink({ choice }: { choice: OwnerChoice }) {
  return <OwnerDialog choice={choice} trigger={<button type="button" className="text-[12.5px] font-semibold hover:underline focus-visible:outline-2 focus-visible:outline-ring">Change</button>} />;
}

/** Title-row actions: Upload to Drive · Ask Hoot about T (primary) · ⋯ for the rest. */
export function HoldingActions({
  ticker,
  holdingId,
  boardHref,
  canUpload,
  uploadDisabledReason,
  owner,
  canExit,
  links,
}: {
  ticker: string;
  holdingId: string;
  boardHref: string;
  canUpload: boolean;
  uploadDisabledReason?: string;
  owner: OwnerChoice;
  canExit: boolean;
  links: { label: string; href: string; external?: boolean }[];
}) {
  const [ownerOpen, setOwnerOpen] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  return (
    <>
      {canUpload && (
        <Dialog>
          <DialogTrigger render={<Button variant="outline" size="lg" />}>
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
      <Button size="lg" nativeButton={false} render={<Link href={boardHref} />}>
        <MessageSquareText className="size-3.5" />
        Ask Hoot about {ticker}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" size="icon-lg" aria-label="More actions" />}>
          <Ellipsis className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => setOwnerOpen(true)}>Change owner…</DropdownMenuItem>
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
      <OwnerDialog choice={owner} open={ownerOpen} onOpenChange={setOwnerOpen} />
      {canExit && (
        <Dialog open={exitOpen} onOpenChange={setExitOpen}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Mark {ticker} exited?</DialogTitle>
              <DialogDescription>It moves off the team&apos;s holdings list. Its notes, documents and history stay.</DialogDescription>
            </DialogHeader>
            <form action={exitHolding} className="flex justify-end gap-2">
              <input type="hidden" name="holdingId" value={holdingId} />
              <Button type="button" variant="outline" onClick={() => setExitOpen(false)}>
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
