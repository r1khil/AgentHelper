"use client";

import { useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/app/native-select";
import { UploadModelForm } from "./upload-model-form";
import type { UploadTarget } from "./types";

/** "Upload .xlsx": pick the holding, then the workbook. A holding that already has a model gets a new version. */
export function UploadModelDialog({
  targets,
  defaultHoldingId,
  label = "Upload .xlsx",
  link,
}: {
  targets: UploadTarget[];
  defaultHoldingId?: string | null;
  label?: string;
  /** Render the trigger as an inline text link instead of a button. */
  link?: boolean;
}) {
  const [holdingId, setHoldingId] = useState(defaultHoldingId ?? targets[0]?.id ?? "");
  const target = targets.find((t) => t.id === holdingId);
  if (!targets.length) return null;
  return (
    <Dialog>
      {link ? (
        <DialogTrigger render={<button type="button" className="rounded-sm hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" />}>{label}</DialogTrigger>
      ) : (
        <DialogTrigger render={<Button size="sm" variant="outline" />}>
          <Upload />
          {label}
        </DialogTrigger>
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
