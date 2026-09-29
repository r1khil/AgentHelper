"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/app/native-select";
import { UploadModelForm } from "./upload-model-form";
import type { UploadTarget } from "./types";

/**
 * "Upload a model": pick the holding, then the workbook. A holding that already has a model gets a new version.
 * The trigger is a secondary button (`header`, for the page header), a small text link (`link`, in a list row), or
 * a compact secondary button (the default).
 */
export function UploadModelDialog({
  targets,
  defaultHoldingId,
  label = "Upload .xlsx",
  trigger = "button",
}: {
  targets: UploadTarget[];
  defaultHoldingId?: string | null;
  label?: string;
  trigger?: "button" | "header" | "link";
}) {
  const [holdingId, setHoldingId] = useState(defaultHoldingId ?? targets[0]?.id ?? "");
  const target = targets.find((t) => t.id === holdingId);
  if (!targets.length) return null;
  return (
    <Dialog>
      {trigger === "link" ? (
        <DialogTrigger render={<button type="button" className="rounded-sm text-caption font-semibold underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ring" />}>{label}</DialogTrigger>
      ) : (
        <DialogTrigger render={<Button variant="secondary" size={trigger === "header" ? "default" : "sm"} />}>{label}</DialogTrigger>
      )}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload a model</DialogTitle>
          <DialogDescription>
            Map its line items once to the figures the company reports to the SEC, and Hoot proposes the other periods with a source for every number. You approve; formulas are never touched.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="model-holding">Holding</Label>
          <NativeSelect id="model-holding" value={holdingId} onChange={(e) => setHoldingId(e.target.value)}>
            {targets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.ticker} · {t.companyName}
                {t.hasModel ? " (new version)" : ""}
              </option>
            ))}
          </NativeSelect>
        </div>
        {target && <UploadModelForm key={target.id} holdingId={target.id} hasModel={target.hasModel} stacked />}
      </DialogContent>
    </Dialog>
  );
}
