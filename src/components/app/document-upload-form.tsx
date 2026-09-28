"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { stageDocumentUpload } from "@/lib/actions/drive";
import { UPLOAD_ACCEPT } from "@/lib/drive/uploads";
import { NativeSelect } from "@/components/app/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const KINDS: { value: string; label: string }[] = [
  { value: "initiating_coverage", label: "Initiating coverage" },
  { value: "earnings_update", label: "Earnings update" },
  { value: "model", label: "Model" },
  { value: "other", label: "Other" },
];

/**
 * Staged upload: the file goes browser → Supabase Storage (signed URL) → server → Google Drive, so it is not
 * limited by the request-size caps on server actions and Vercel functions.
 */
export function DocumentUploadForm({ holdingId, disabledReason }: { holdingId: string; disabledReason?: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState("earnings_update");
  const [busy, setBusy] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return toast.error("Choose a file first");
    setBusy("Preparing…");
    try {
      const staged = await stageDocumentUpload({ holdingId, fileName: file.name, size: file.size, mimeType: file.type || undefined });
      if (!staged.ok) throw new Error(staged.error);
      setBusy("Uploading…");
      const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
      const up = await supabase.storage.from("models").uploadToSignedUrl(staged.path, staged.token, file, { contentType: file.type || undefined });
      if (up.error) throw new Error(up.error.message);
      setBusy("Adding to Drive…");
      const res = await fetch("/api/drive/upload", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ holdingId, kind, stagedPath: staged.path, fileName: file.name, mimeType: file.type || undefined }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string; textError?: string | null };
      if (!json.ok) throw new Error(json.error ?? "Upload failed");
      toast.success(json.textError ? `Added to the Drive (text not extracted: ${json.textError})` : "Added to the Drive. The summary appears here once the file has been read.");
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  if (disabledReason) return <p className="text-xs text-muted-foreground">{disabledReason}</p>;

  return (
    <form onSubmit={submit} className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <NativeSelect value={kind} onChange={(e) => setKind(e.target.value)} className="w-44" aria-label="Document kind">
          {KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </NativeSelect>
        <Input ref={fileRef} type="file" accept={UPLOAD_ACCEPT} className="min-w-0 flex-1" required />
        <Button type="submit" size="sm" variant="outline" disabled={busy !== null}>
          {busy ? <Loader2 className="animate-spin" /> : <Upload />}
          {busy ?? "Upload"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Filed under the team and company folder in the Fund&rsquo;s Drive; Hoot can read it right away. Up to 50MB.</p>
    </form>
  );
}
