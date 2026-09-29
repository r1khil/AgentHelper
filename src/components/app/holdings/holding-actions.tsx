"use client";

import { useState } from "react";
import Link from "next/link";
import { Ellipsis } from "lucide-react";
import { exitHolding } from "@/lib/actions/holdings";
import { DocumentUploadForm } from "@/components/app/document-upload-form";
import { TradeDialog } from "@/components/app/attribution/trade-dialog";
import { UploadModelDialog } from "@/components/app/models/upload-model-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

/**
 * The holding page header's actions: Upload model and Record trade side by side, and the rest in a quiet ⋯ menu
 * (Upload to Drive, SEC EDGAR, Mark exited). Each is offered only to readers the old pages offered it to.
 */
export function HoldingActions({
  ticker,
  holdingId,
  companyName,
  hasModel,
  canUpload,
  uploadDisabledReason,
  trade,
  canExit,
  links,
}: {
  ticker: string;
  holdingId: string;
  companyName: string;
  hasModel: boolean;
  /** An active holding: models and documents can be added. */
  canUpload: boolean;
  uploadDisabledReason?: string;
  /** Execs and admins record trades; `today` and the position size prefill the dialog. */
  trade: { today: string; shares: number | null } | null;
  canExit: boolean;
  links: { label: string; href: string; external?: boolean }[];
}) {
  const [tradeOpen, setTradeOpen] = useState(false);
  const [driveOpen, setDriveOpen] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const menu = canUpload || canExit || links.length > 0;
  return (
    <>
      {canUpload && <UploadModelDialog targets={[{ id: holdingId, ticker, companyName, hasModel }]} label="Upload model" trigger="header" />}
      {trade && (
        <>
          <Button variant="secondary" onClick={() => setTradeOpen(true)}>
            Record trade
          </Button>
          <TradeDialog trigger={false} open={tradeOpen} onOpenChange={setTradeOpen} today={trade.today} positions={trade.shares != null ? [{ ticker, shares: trade.shares }] : []} defaults={{ ticker }} />
        </>
      )}
      {menu && (
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label={`More actions for ${ticker}`} />}>
            <Ellipsis className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {canUpload && (
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => setDriveOpen(true)}>Upload to Drive…</DropdownMenuItem>
              </DropdownMenuGroup>
            )}
            {links.length > 0 && (
              <DropdownMenuGroup>
                {links.map((l) => (
                  <DropdownMenuItem key={l.href} render={l.external ? <a href={l.href} target="_blank" rel="noreferrer" /> : <Link href={l.href} />}>
                    {l.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            )}
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
      )}
      {canUpload && (
        <Dialog open={driveOpen} onOpenChange={setDriveOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Upload to the Fund&apos;s Drive</DialogTitle>
              <DialogDescription>A report, earnings update or model for {ticker}. Hoot can read it as soon as it&apos;s filed.</DialogDescription>
            </DialogHeader>
            <DocumentUploadForm holdingId={holdingId} disabledReason={uploadDisabledReason} />
          </DialogContent>
        </Dialog>
      )}
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
