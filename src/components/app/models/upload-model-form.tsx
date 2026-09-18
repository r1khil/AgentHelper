"use client";

import { useRef, useState, useTransition } from "react";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { createModelUploadUrl, finalizeModelUpload } from "@/lib/actions/models";
import { MODEL_BUCKET, MODEL_CONTENT_TYPES, validateModelFile } from "@/lib/models/upload";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Stage = "idle" | "uploading" | "reading";

/**
 * Uploads a workbook without sending it through a Server Action body (1MB default, 4.5MB on Vercel):
 * sign → PUT straight to the private bucket with the publishable key → finalize (small JSON), which redirects.
 */
export function UploadModelForm({ holdingId, hasModel }: { holdingId: string; hasModel: boolean }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [pending, start] = useTransition();
  const busy = pending || stage !== "idle";

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return toast.error("Choose an .xlsx file");
    const check = validateModelFile(file.name, file.size);
    if (!check.ok) return toast.error(check.error);
    start(async () => {
      try {
        setStage("uploading");
        const signed = await createModelUploadUrl({ holdingId, fileName: file.name, size: file.size });
        if (!signed.ok) throw new Error(signed.error);
        const { error } = await createSupabaseBrowser().storage.from(MODEL_BUCKET).uploadToSignedUrl(signed.path, signed.token, file, { contentType: MODEL_CONTENT_TYPES[check.ext] });
        if (error) throw new Error(`Upload failed: ${error.message}`);
        setStage("reading");
        // On success the action redirects to the new model page and never returns here.
        const result = await finalizeModelUpload({ holdingId, path: signed.path, fileName: file.name });
        if (result?.ok === false) throw new Error(result.error);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err));
        setStage("idle");
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex items-center gap-2">
      <Input ref={fileRef} type="file" name="file" accept=".xlsx,.xlsm" required disabled={busy} className="w-56" />
      <Button type="submit" size="sm" variant="outline" disabled={busy}>
        {busy ? <Loader2 className="animate-spin" /> : <Upload />}
        {stage === "uploading" ? "Uploading…" : stage === "reading" ? "Reading workbook…" : hasModel ? "New version" : "Upload"}
      </Button>
    </form>
  );
}
